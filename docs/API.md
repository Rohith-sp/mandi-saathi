# API Contracts

All routes are Next.js App Router route handlers under `app/api/`. JSON in, JSON out. Times are ISO 8601 in Asia/Kolkata unless noted.

Auth schemes:
- **Bolna secret:** header `x-api-secret: $BOLNA_TOOL_SECRET`. Used by every route Bolna calls.
- **Cron secret:** header `authorization: Bearer $CRON_SECRET`. Used by scheduled jobs.
- **Operator session:** Supabase Auth cookie. Used by dashboard routes; RLS applies.

Wrong or missing secret → `401 {"error":"unauthorized"}`. Validation errors → `400 {"error":"<code>","detail":...}`. Validate every body with zod.

---

## POST /api/advise
Called by the Bolna tool `get_selling_options` during the call.

Auth: Bolna secret.

Request:
```json
{
  "crop": "ragi",
  "quantity_quintals": 15,
  "village": "Mulbagal",
  "debt_rupees": 20000,
  "caller_phone": "+9198XXXXXXXX",
  "call_id": "bolna-execution-id"
}
```
`caller_phone` and `call_id` come from Bolna call context (verify the variable names in Bolna docs). `debt_rupees` defaults to 0.

Response 200 (status `ok`):
```json
{
  "status": "ok",
  "request_id": "uuid",
  "crop": "ragi",
  "quantity_quintals": 15,
  "options": [
    {
      "id": "sell_far_pooled",
      "label": "Shared truck to Chintamani",
      "mandi": "Chintamani",
      "distance_km": 55,
      "net_rupees": 33015,
      "say_amount": 33000,
      "confidence": "high",
      "price_date": "2026-12-01",
      "price_age_days": 1,
      "pool_basis": "observed",
      "spoken": true
    },
    {
      "id": "store_loan",
      "label": "Store in FPO warehouse, take loan, sell in about a month",
      "net_range": { "p10": 27094, "p50": 29727, "p90": 31482 },
      "say_amount": 29700,
      "confidence": "medium",
      "loan_rupees": 22500,
      "loan_eligible_alone": false,
      "requires_pool": true,
      "spoken": false
    }
  ],
  "pool_available": true,
  "debt_note": { "gap_per_qtl": 274, "best_option_id": "sell_far_pooled" },
  "sms_queued": true
}
```

Other statuses (still HTTP 200 so the agent can speak them):
```json
{ "status": "unsupported_crop", "supported_crops": ["ragi","tur","tomato"] }
{ "status": "needs_clarification", "field": "village" }
{ "status": "no_price" }
```

Side effects: upsert `farmers` by phone, insert `sale_requests` (inputs + full options JSON), send SMS after building the response (failure logged, never thrown).

Latency budget: p95 < 1.5 s. No calls to data.gov.in or Open-Meteo here.

---

## POST /api/bolna/call-complete
Bolna post-call webhook. Carries the extraction results.

Auth: Bolna secret (configure as custom header on the webhook if Bolna supports it; otherwise a `?token=` query param checked against the same secret).

Request (shape depends on Bolna; map these fields):
```json
{
  "execution_id": "bolna-execution-id",
  "status": "completed",
  "extracted_data": { "pool_interest": "yes" },
  "telephony_data": { "to_number": "...", "from_number": "...", "duration": 142 }
}
```
Behaviour: find `sale_requests` by `call_id = execution_id`, set `pool_interest` (`yes`→true, `no`→false, else null), store `call_duration_s`. Unknown execution id → 200 and log (Bolna retries are harmless).

Response: `200 {"ok":true}`.

---

## POST /api/cron/pools
Runs the pooling job. Called by GitHub Actions every 3 hours (Vercel Hobby crons are daily only).

Auth: Cron secret.

Behaviour (see ARCHITECTURE §Pooling): group open requests, insert `pools` with status `proposed` and `pool_members` with response `pending`. Idempotent: a request already in a non-cancelled pool is skipped.

Response: `200 {"created": 2, "skipped": 5}`.

---

## POST /api/pools/[id]/confirm
Operator confirms a proposed pool from the dashboard.

Auth: Operator session; pool must belong to operator's FPO (checked by RLS and explicitly).

Request:
```json
{ "pickup_date": "2026-12-05", "pickup_place": "Mulbagal bus stand", "vehicle_note": "Tata 407, KA-07-XXXX" }
```
Behaviour: set pool `status = confirming`, save details, for each member call Bolna outbound API with the pool-confirmation agent and `user_data` (pool id, member id, crop, qty, date, place). Rate-limit to 1 call/second.

Response: `200 {"calls_started": 6}`.

---

## POST /api/bolna/pool-response
Tool called by the pool-confirmation agent when the member answers.

Auth: Bolna secret.

Request:
```json
{ "pool_member_id": "uuid", "answer": "yes" }
```
Behaviour: update `pool_members.response`; if yes, send confirmation SMS; when no members are pending, set pool `status = confirmed` (≥1 yes) or `cancelled`.

Response: `200 {"ok":true}`.

---

## GET /api/health
No auth. Returns `{ "ok": true, "latest_price_date": "2026-12-01" }` so you can see at a glance whether ingestion is running.

---

## Scheduled scripts (not HTTP)

| Script | Schedule (GitHub Actions) | Does |
|---|---|---|
| `scripts/ingest-prices.ts` | daily 18:30 IST | Pull data.gov.in for target state/district/crops, clean, upsert `prices` |
| `scripts/compute-forecasts.ts` | weekly Sunday | Recompute `forecasts` from `prices` history |
| `scripts/backfill-prices.ts` | manual | Load AGMARKNET CSV exports into `prices` |
| `curl /api/cron/pools` | every 3 h | Pooling job |

### data.gov.in source
Dataset "Current Daily Price of Various Commodities from Various Markets (Mandi)". Resource id (verify on the dataset page): `9ef84268-d588-465a-a308-a864a43d0070`.
```
GET https://api.data.gov.in/resource/<id>?api-key=$DATA_GOV_API_KEY&format=json&limit=1000
    &filters[state]=Karnataka&filters[district]=Kolar&filters[commodity]=Ragi (Finger Millet)
```
Fields: state, district, market, commodity, variety, grade, arrival_date (dd/mm/yyyy), min_price, max_price, modal_price. This endpoint gives only current data, so start the daily job immediately to build history, and backfill older history from AGMARKNET exports.

Cleaning rules: map commodity names to crop ids (`crop_aliases` table); parse dates as IST; drop rows where modal is outside [min, max] or any price ≤ 0; one row per (mandi, crop, date) keeping the highest arrivals or the first seen.
