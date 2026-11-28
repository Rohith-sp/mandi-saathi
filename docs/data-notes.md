# Data Notes

Track data quality issues, coverage gaps, and backtest results.

## Forecast backtest coverage

Target: 70–90% (actual price inside P10–P90). Below 70% means ranges are too narrow and confidence is overstated.

| Date | Pairs tested | Coverage % | Notes |
|---|---|---|---|
| | | | Run `npm run backtest` against a real Supabase project with ≥ 2 years of data. |

## Data gaps

- Mandi name matching against data.gov.in `market` strings (see T0.3).
- Historical backfill source: AGMARKNET exports (2–3 years, demo mandis, 3 crops).
- Price staleness: mandis with prices older than 7 days are excluded; older than 2 days shows spoken caveat.

## Cost constant validation

Values in `lib/calc/config.ts` marked ASSUMPTION to be confirmed by field calls (T3.2):
- `COMMISSION_PCT` (0.02)
- `LOCAL_TRIP_COST` (₹500)
- `TRUCK_BASE_COST` (₹1000), `TRUCK_COST_PER_KM` (₹30)
- `WAREHOUSE_COST_PER_QTL_MONTH` (₹10)
- `LOAN_RATE_PA` (0.07), `LOAN_LTV` (0.75)

## Real coordinates

Mandi names and coordinates must be real (no invented data). Source from OpenStreetMap / Google Maps. See `scripts/seed.ts` and `supabase/seed/`.
