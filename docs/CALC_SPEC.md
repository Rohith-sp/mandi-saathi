# Calculation Spec — Net Take-Home Engine

This is the source of truth for every number the farmer hears. Code in `lib/calc/` must implement exactly this, and the golden tests in section 8 must pass.

## 1. Units and rounding

- Quantity: quintals (1 qtl = 100 kg). Bags are converted by the voice agent before the tool call.
- Prices: ₹ per quintal (data.gov.in modal/min/max are already ₹/qtl).
- Money: compute in floating point, round the final net of each option with `Math.round` to whole rupees. Never round intermediate values.
- Spoken amounts: the API also returns `say_amount`, the net rounded to the nearest ₹100.
- Dates: Asia/Kolkata. `price_age_days` = whole days between the price's `arrival_date` and today.

## 2. Config constants

All live in `lib/calc/config.ts`. Values marked ASSUMPTION are placeholders until confirmed by field calls; change them only in this file.

| Key | Default | Note |
|---|---|---|
| `COMMISSION_PCT` | 0.02 | ASSUMPTION. Per-mandi override via `mandis.commission_pct` |
| `LOCAL_TRIP_COST` | 500 | ASSUMPTION. ₹ per local tractor/tempo trip |
| `LOCAL_TRIP_CAPACITY_QTL` | 20 | ASSUMPTION |
| `TRUCK_BASE_COST` | 1000 | ASSUMPTION. ₹ fixed per truck trip |
| `TRUCK_COST_PER_KM` | 30 | ASSUMPTION. ₹ per one-way km, return trip included |
| `TRUCK_CAPACITY_QTL` | 50 | ASSUMPTION |
| `POOL_MIN_FILL` | 0.6 | Pool proposed at ≥ 60% of truck capacity |
| `POOL_RADIUS_KM` | 15 | |
| `FAR_MANDI_MAX_KM` | 80 | Mandis beyond this are ignored |
| `WAREHOUSE_COST_PER_QTL_MONTH` | 10 | ASSUMPTION. Overridden by `warehouses.charge_per_qtl_month` |
| `LOAN_RATE_PA` | 0.07 | KCC pledge-loan rate |
| `LOAN_LTV` | 0.75 | |
| `LOAN_MIN` | 100000 | SBI agri pledge-loan minimum |
| `STORE_MONTHS` | 1 | Horizon for the store option (4 weeks) |
| `PRICE_STALE_DAYS` | 7 | Mandis with older prices are excluded |
| `PRICE_OLD_DAYS` | 2 | Older than this → spoken caveat |

Crop table (`crops` in DB, mirrored in config for tests):

| crop | storable | transit_loss_pct (far mandi) | storage_loss_pct_per_month |
|---|---|---|---|
| ragi | true | 0 | 0.005 |
| tur | true | 0 | 0.005 |
| tomato | false | 0.03 | n/a |

## 3. Inputs

```
q        quantity_quintals (> 0, ≤ 500)
home     farmer location (point) from village lookup
crop     one of crops table
debt     debt_rupees (≥ 0, default 0)
```

Data the engine reads:
- `localMandi` = nearest mandi to `home` with a non-stale price for `crop`.
- `farMandi` = among other non-stale mandis within `FAR_MANDI_MAX_KM`, the one with the highest **pooled** net for this farmer. Distance `d` = road distance if stored, else straight-line × 1.3.
- `poolQty` = this request's `q` + sum of `q` of other open requests (same crop, same sale week, `pool_interest` not false, within `POOL_RADIUS_KM` of `home`), capped at `TRUCK_CAPACITY_QTL`. If `poolQty < TRUCK_CAPACITY_QTL * POOL_MIN_FILL`, use `TRUCK_CAPACITY_QTL * POOL_MIN_FILL` as the assumed pool size and set `pool_basis = "assumed"`, else `"observed"`.
- Forecast `r10, r50, r90` = fractional price change over 4 weeks for (`localMandi`, `crop`, ISO week of today) from `forecasts`.

## 4. Options

Let `trips(x) = ceil(x / LOCAL_TRIP_CAPACITY_QTL)` and `truck(d) = TRUCK_BASE_COST + TRUCK_COST_PER_KM * d`.

### 4.1 sell_local
```
gross = q * P_local * (1 - 0)            // no transit loss locally
net   = gross - COMMISSION_PCT*gross - LOCAL_TRIP_COST*trips(q)
```

### 4.2 sell_far_alone
```
gross = q * P_far * (1 - transit_loss_pct)
net   = gross - COMMISSION_PCT*gross - truck(d)
```
Shown only to make the pooling gain visible. Omit it from the spoken list if it is worse than sell_local (still returned in JSON with `spoken: false`).

### 4.3 sell_far_pooled
```
gross = q * P_far * (1 - transit_loss_pct)
share = truck(d) * q / poolQty
net   = gross - COMMISSION_PCT*gross - share
```

### 4.4 store_loan (storable crops only)
```
V        = q * P_local                       // today's value
loan     = LOAN_LTV * V
interest = loan * LOAN_RATE_PA * STORE_MONTHS / 12
for r in (r10, r50, r90):
  g   = V * (1 + r) * (1 - storage_loss_pct_per_month * STORE_MONTHS)
  g  -= COMMISSION_PCT * g
  net = g - WAREHOUSE_COST_PER_QTL_MONTH*q*STORE_MONTHS - interest - 2*LOCAL_TRIP_COST*trips(q)
```
The loan amount is paid out today; the net above is the total the farmer ends up with after repaying principal and interest.

Flags:
- `loan_eligible_alone = loan >= LOAN_MIN`
- `pool_qty_for_loan = ceil(LOAN_MIN / LOAN_LTV / P_local)` (quintals a pooled deposit needs)

If not eligible alone, the option is still returned with `requires_pool: true`.

## 5. Ranking and output

1. Compute all applicable options.
2. Sort by `net` (P50 for store_loan) descending.
3. Spoken list: top 3 where `spoken: true`. `sell_local` is always included (it is the trader baseline) even if ranked 4th.
4. `pool_available = true` if sell_far_pooled or a pooled store_loan is in the spoken list.

## 6. Confidence

| Option | high | medium | low |
|---|---|---|---|
| sell_local, sell_far_* | price age ≤ 2 days | 3–5 days | 6–7 days |
| store_loan | band `(net90 - net10)/net50 ≤ 0.10` and price age ≤ 2 | band ≤ 0.20 | otherwise, or forecast built from < 3 years of data |

`sell_far_pooled` with `pool_basis = "assumed"` is capped at medium.

## 7. Debt note

If `debt > 0`:
```
gap_per_qtl = round((best_net - sell_local_net) / q)
```
Return `debt_note = { gap_per_qtl, best_option_id }`. If gap ≤ 0, return null. For store_loan also return `loan_covers_debt = loan >= debt` (only meaningful when pooled).

## 8. Golden test cases

Use the default config. These numbers were computed from the formulas above and must match exactly.

### Case A — ragi, 15 qtl
Inputs: `P_local` = 2000 (Kolar), `P_far` = 2300 (Chintamani), `d` = 55 km, `poolQty` = 50, forecast r = (−0.03, +0.06, +0.12), prices 1 day old.

| Option | net | say_amount | confidence |
|---|---|---|---|
| sell_local | 28,900 | 28,900 | high |
| sell_far_alone | 31,160 | 31,200 | high |
| sell_far_pooled | 33,015 | 33,000 | high |
| store_loan P10 / P50 / P90 | 27,094 / 29,727 / 31,482 | 29,700 | medium (band 0.148) |

Also: `loan` = 22,500, `loan_eligible_alone` = false, `pool_qty_for_loan` = 67.
Ranking: pooled 33,015 → alone 31,160 → store P50 29,727 → local 28,900. Spoken: pooled, alone, local (local forced in; store dropped as 4th). With `debt = 20000`: `gap_per_qtl` = round((33015 − 28900)/15) = 274.

### Case B — tomato, 20 qtl
Inputs: `P_local` = 1200, `P_far` = 1500, `d` = 40 km, `poolQty` = 50, transit loss 3%.

| Option | net |
|---|---|
| sell_local | 23,020 |
| sell_far_alone | 26,318 |
| sell_far_pooled | 27,638 |
| store_loan | not returned (not storable) |

### Case C — edge cases (must return errors or empty, never throw)
- `q = 0` → 400 `invalid_quantity`
- unknown crop → 200 with `status: "unsupported_crop"` and `supported_crops`
- no non-stale local price → 200 with `status: "no_price"`
- village not found → 200 with `status: "needs_clarification"`, `field: "village"`
