# Architecture

## 1. Components

```
FARMER (any phone)
   │ voice                                   ▲ SMS
   ▼                                         │
BOLNA  ── Sarvam STT → LLM → Sarvam TTS      TWILIO
   │  tool: get_selling_options ─────────┐     ▲
   │  post-call webhook (extraction) ──┐ │     │
   │  tool: record_pool_answer ──────┐ │ │     │
   ▼                                 ▼ ▼ ▼     │
NEXT.JS on VERCEL ─────────────────────────────┘
   app/api/advise              calc options, save request, send SMS
   app/api/bolna/call-complete save pool_interest
   app/api/bolna/pool-response save yes/no, send SMS
   app/api/cron/pools          pooling job
   app/api/pools/[id]/confirm  dashboard → Bolna outbound calls
   app/(dashboard)/*           FPO PWA
   │
   ▼
SUPABASE  Postgres + PostGIS + Auth + RLS
   ▲
GITHUB ACTIONS  daily price ingestion · weekly forecasts · 3-hourly pooling trigger
   ▲
data.gov.in · AGMARKNET exports · Open-Meteo (P2)
```

Design rule: **the voice layer only listens and speaks.** All prices, costs, rankings and pool decisions live in our backend. Bolna can be replaced by any provider that supports function calling and webhooks without touching `lib/`.

## 2. Repository layout

```
mandi-saathi/
├─ AGENTS.md  CLAUDE.md  README.md  .env.example
├─ app/
│  ├─ api/
│  │  ├─ advise/route.ts
│  │  ├─ bolna/call-complete/route.ts
│  │  ├─ bolna/pool-response/route.ts
│  │  ├─ cron/pools/route.ts
│  │  ├─ pools/[id]/confirm/route.ts
│  │  └─ health/route.ts
│  ├─ (dashboard)/            requests, pools, prices pages
│  └─ login/
├─ lib/
│  ├─ calc/                   pure functions, no I/O (config.ts, options.ts, confidence.ts, rank.ts)
│  ├─ data/                   Supabase queries (server-only)
│  ├─ pooling/                grouping algorithm (pure) + persistence
│  ├─ sms/                    Twilio client + message templates
│  ├─ bolna/                  outbound call client, payload types
│  ├─ auth.ts                 secret checks
│  └─ supabase/               server and browser clients
├─ scripts/                   ingest-prices.ts, backfill-prices.ts, compute-forecasts.ts, seed.ts
├─ supabase/migrations/
├─ tests/                     vitest: calc golden tests, pooling, route tests with mocked DB
├─ .github/workflows/         ci.yml, ingest.yml, forecasts.yml, pools.yml
└─ docs/
```

`lib/calc` and the pure part of `lib/pooling` must not import Supabase, Twilio or `fetch`. That keeps them testable with the golden cases.

## 3. Data flows

### 3.1 Price ingestion (before any call)
1. `ingest.yml` runs `scripts/ingest-prices.ts` daily at 18:30 IST.
2. Fetch data.gov.in rows for the target state and districts, paging until empty.
3. Map commodity → crop via `crop_aliases`; map market → `mandis` by (name, district). Unknown markets are logged, not inserted.
4. Validate (min ≤ modal ≤ max, > 0), upsert into `prices`.
5. Log counts. `/api/health` shows `latest_price_date`.

### 3.2 Forecasts (weekly)
For each (mandi, crop, ISO week w): collect every historical day in week w, compute the price change to the same mandi's price 28 days later (nearest available within ±3 days), take the 10th, 50th and 90th percentiles. Store with `years_of_data`. Fewer than 20 samples → skip; the advise route then falls back to the crop-wide forecast across mandis and marks confidence low.

Backtest script prints coverage: share of held-out year where actual change falls inside [r10, r90]. Put this number in the pitch.

### 3.3 Advice call
1. Farmer calls Bolna number. Agent collects slots (see VOICE_AGENT.md).
2. Bolna calls `POST /api/advise` with slots + caller number + call id.
3. Route: validate → resolve village (exact, then case-insensitive, then trigram if enabled) → load local + nearby mandi prices, forecast, open nearby requests → `lib/calc` → rank → save `sale_requests` → respond.
4. After the response JSON is built, send SMS (await with 3 s timeout; on failure write `sms_log` with `failed`).
5. Agent speaks the spoken options, asks pool question if `pool_available`.
6. Call ends → Bolna posts to `/api/bolna/call-complete` with `pool_interest` extraction.

### 3.4 Pooling
Runs every 3 hours via `pools.yml` → `POST /api/cron/pools`.

Algorithm (greedy, deterministic):
1. Load open requests with `pool_interest is not false`, not already in an active pool, grouped by (crop, sale_week).
2. Within a group, sort by quantity desc. Take the first unassigned request as seed; walk the remaining unassigned requests within `POOL_RADIUS_KM` of the seed (nearest first) and add each one only if the total stays ≤ `TRUCK_CAPACITY_QTL`.
3. If total ≥ `TRUCK_CAPACITY_QTL × POOL_MIN_FILL` → create `truck` pool, target = far mandi with highest average pooled net for the members.
4. Else if crop is storable and total × local price × LTV ≥ `LOAN_MIN` → create `warehouse` pool, target = nearest WDRA-registered warehouse.
5. Repeat with the next unassigned seed.
6. Mark members' requests `status = pooled`.

### 3.5 Pool confirmation
1. Operator opens pool, enters date/place/vehicle, presses Confirm.
2. Route calls Bolna outbound API once per member with the pool-confirmation agent and `user_data`.
3. That agent asks yes/no and calls `record_pool_answer` → `/api/bolna/pool-response`.
4. Yes → SMS with details. When no member is pending, pool becomes `confirmed` or `cancelled`. Members who don't answer within the call are set to `no_answer` by the call-complete webhook.

## 4. Security

| Surface | Control |
|---|---|
| Bolna → API | `x-api-secret` header, constant-time compare (`crypto.timingSafeEqual`) |
| Cron → API | `Authorization: Bearer $CRON_SECRET` |
| Dashboard | Supabase Auth email login; RLS limits rows to operator's FPO; route handlers re-check pool ownership |
| Secrets | Only in Vercel/GitHub env. `SUPABASE_SERVICE_ROLE_KEY` never imported in client components (`import "server-only"` in `lib/data`) |
| Input | zod on every body; quantity bounded 0–500; strings length-limited |
| Logs | No full phone numbers or debt amounts in logs; mask as `+91******1234` |
| Abuse | Rate-limit `/api/advise` per caller (e.g. 10/hour) — P1 |

## 5. Environments

| Env | Where | Notes |
|---|---|---|
| local | `npm run dev` + Supabase cloud dev project | Expose with `ngrok`/`cloudflared` to test Bolna tool calls |
| preview | Vercel preview per PR | Uses same Supabase dev project |
| prod (demo) | Vercel production | Separate Supabase project if time allows; otherwise dev |

## 6. Failure handling

| Failure | Behaviour |
|---|---|
| Supabase down / timeout | `/api/advise` returns 503; agent says sorry, callback promised (prompt handles non-200) |
| No fresh price for local mandi | `status: no_price`; agent says it can't find today's price |
| Twilio fails | Call continues; `sms_log` failed row; dashboard shows it |
| Bolna outbound fails for a member | Member marked `no_answer`; operator can retry from dashboard (P1) |
| Ingestion fails | GitHub Actions marks run failed (email notification); stale prices are excluded automatically after 7 days |
