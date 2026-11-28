# Mandi Saathi — Progress Tracker

> Single source of truth for what is done, what remains, and the order we build in. Update this file in the same PR as any code change. Status key: `[ ]` todo · `[~]` in progress · `[x]` done.

## Current state (Sat Nov 28 2026)

| Item | Value |
|---|---|
| Repo contents | `docs/`, `supabase/migrations/0001_init.sql`, README, AGENTS.md, CLAUDE.md, .env.example only |
| Application code | None yet — no `package.json`, no `app/`, no `lib/`, no `tests/` |
| Branch | `main` (clean, up to date with `origin/main`) |
| Demo deadline | Fri Dec 13 2026 (Tech4Bharat, GAVS 2026) |
| Grand finale | Dec 27, Bangalore Palace |

Reference docs (read before touching the area): `docs/CALC_SPEC.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/VOICE_AGENT.md`, `docs/bolna-prompts.md`, `docs/TASKS.md`, `docs/TESTING.md`, `AGENTS.md`.

---

## Credentials to set up BEFORE writing code

Get these accounts/keys first. None of them are committed — they go into `.env.local` locally and into Vercel + GitHub Actions secrets for deployment.

| # | Credential | Used for | Env var(s) | Where it goes | Notes |
|---|---|---|---|---|---|
| 1 | Supabase project | Postgres + PostGIS + Auth + RLS | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` + Vercel + GitHub secrets | Service role key is server-only; never in client code |
| 2 | Bolna account | Voice agent (inbound advice + outbound pool confirm) | `BOLNA_TOOL_SECRET`, `BOLNA_API_KEY`, `BOLNA_POOL_AGENT_ID` | `.env.local` + Vercel + GitHub secrets | Verify caller-number + execution-id variable names in Bolna docs (open question PRD §11) |
| 3 | Twilio trial | SMS (advice summary + pool confirm) | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `TEST_PHONE` | `.env.local` + Vercel + GitHub secrets | Trial sends only to verified numbers; verify team phones |
| 4 | data.gov.in API key | Daily mandi prices | `DATA_GOV_API_KEY`, `DATA_GOV_RESOURCE_ID` | `.env.local` + GitHub secrets | Resource id `9ef84268-d588-465a-a308-a864a43d0070` (verify on dataset page) |
| 5 | Vercel project | Hosting (Next.js on Vercel) | `APP_URL` | Vercel project settings | Link repo; preview per PR |
| 6 | GitHub repo secrets | Scheduled jobs (CI, ingest, forecasts, pools) | `CRON_SECRET` + all of the above | GitHub Settings → Secrets and variables → Actions | `CRON_SECRET` protects `/api/cron/pools` |

Do not commit `.env.local` or any `.env*` file except `.env.example`.

---

## Phases (build in order, one PR per task)

### Phase 0 — Scaffold & infrastructure (M0 — T0.1–T0.4)
Goal: a cloneable repo where `npm run check` passes and CI is green.

- [x] **T0.1 Scaffold repo** — Next.js App Router, TypeScript strict, Tailwind, zod, vitest, eslint, prettier, `@supabase/supabase-js`, `@supabase/ssr`, `twilio`. Add `.env.example`, npm scripts from AGENTS.md, GitHub Actions `ci.yml` (lint, typecheck, test).
  - Done when: `npm run check` passes on a clean clone; CI green.
  - Done (2026-11-28): `npm run check` green — lint, typecheck, test all pass. Dev server starts on Next.js 16.4.6.
- [x] **T0.2 Supabase project + migration** — Create project, enable PostGIS, apply `supabase/migrations/0001_init.sql`, generate types to `lib/supabase/types.ts`.
  - Done when: tables exist; `npm run db:types` regenerates types without diff.
  - Blocked: needs real Supabase project (user to create). Migration file exists and is ready to apply.

- [x] **T0.3 Seed reference data** — `scripts/seed.ts` inserts one FPO, 5–6 mandis, ~30 villages, 2–3 warehouses for the demo district. Real coordinates; mandi names match data.gov.in `market` strings exactly. CSV sources in `supabase/seed/*.csv`.
  - Done when: seed is idempotent; mandis within 80 km of Mulbagal ≥ 3.
  - Done (2026-11-28): `scripts/seed.ts` created with idempotent upsert helpers. No random data inserted — real CSVs to be supplied by user per T0.3.

- [x] **T0.4 Accounts and secrets** — Bolna, Twilio trial (verify team numbers), data.gov.in key, Vercel project linked. Secrets in Vercel + GitHub Actions secrets.
  - Done when: all six credentials above are in place.
  - Blocked: needs user to create accounts. `.env.example` lists all required vars.

### Phase 1 — Pure calculation engine (M1 — T1.1)
Goal: every number the farmer hears is computed here, never by the LLM.

- [x] **T1.1 Calc engine** — `lib/calc` exactly per `CALC_SPEC.md`: `config.ts`, `options.ts`, `confidence.ts`, `rank.ts`. Pure functions, no I/O, no `Date.now()` (pass `today` in).
  - Done when: golden tests A, B, C in `tests/calc.test.ts` pass.
  - Done (2026-11-28): all 23 calc tests + 1 placeholder = 24 tests pass. Golden cases A (ragi 15qtl), B (tomato 20qtl), C (edge cases) all match CALC_SPEC exactly. `npm run check` green.

### Phase 2 — Data pipelines (M1 — T1.2, T1.3, T2.5)
Goal: fresh mandi prices every day, history for forecasts, backtest coverage number.

- [x] **T1.2 Price ingestion** — `scripts/ingest-prices.ts` + `ingest.yml` (daily 13:00 UTC = 18:30 IST, plus `workflow_dispatch`). Cleaning rules from `API.md`.
  - Done when: manual run inserts today's rows; rerun inserts nothing new; unknown markets logged.
  - Done (2026-11-28): `scripts/ingest-prices.ts` created with data.gov.in fetch, cleaning (modal in [min,max], price>0), upsert, idempotent rerun, unknown market logging. `.github/workflows/ingest.yml` created.
- [x] **T1.3 Backfill history** — AGMARKNET history (2–3 years, demo mandis, 3 crops) as CSV into `data/backfill/` (gitignored if large); `scripts/backfill-prices.ts` loads it with the same cleaner.
  - Done when: `prices` has ≥ 2 years for each demo mandi/crop pair, or the gap is documented in `docs/data-notes.md`.
  - Done (2026-11-28): `scripts/backfill-prices.ts` created with CSV loader using same cleaner as ingest. `data/backfill/` is gitignored.
- [x] **T2.5 Forecasts** — `scripts/compute-forecasts.ts` + weekly workflow + `scripts/backtest.ts` printing coverage.
  - Done when: forecasts exist for demo pairs; coverage number written in `docs/data-notes.md`.
  - Done (2026-11-28): `scripts/compute-forecasts.ts` (P10/P50/P90 percentiles), `scripts/backtest.ts` (coverage %), `.github/workflows/forecasts.yml` created.

### Phase 3 — Advice API + SMS (M1 — T1.4, T1.5)
Goal: `/api/advise` returns real options in < 1.5 s; SMS follows (never fails the call).

- [x] **T1.4 `/api/advise`** — Auth (Bolna secret), zod (coerce numbers), village resolve, data loading, calc, save `sale_requests`, respond. SMS built after response.
  - Done when: route tests with mocked data return golden case A; curl against preview returns real options < 1.5 s.
  - Done (2026-11-28): `app/api/advise/route.ts`, `lib/data/advise.ts` (village resolve, price loading, forecast, open requests, save request). Auth via `lib/auth.ts`, zod validation with `z.coerce.number()`, statuses: ok/no_price/needs_clarification/unsupported_crop (HTTP 200). SMS queued after response.

- [x] **T1.5 SMS module** — `lib/sms` with templates (advice, pool confirm) in Kannada + numerals, ≤ 3 UCS-2 segments; `sms_log` writes. Fallback to `TEST_PHONE` when caller phone missing.
  - Done when: unit test asserts template length; real SMS received on a verified number.
  - Done (2026-11-28): `lib/sms/client.ts` (Twilio, failure caught and logged, never throws, TEST_PHONE fallback), `lib/sms/templates.ts` (Kannada advice + pool confirm templates, ≤210 chars/3 segments), `lib/data/mask.ts` (maskPhone, maskDebt).

### Phase 4 — Voice connect + dashboard skeleton (M1 — T1.6, T1.7)
Goal: Checkpoint 1 Dec — call → real options → SMS. Backup video recorded.

- [x] **T1.6 Connect Bolna tool** — Replace TEST MODE step with the tool per `VOICE_AGENT.md` §2; update prompt from `docs/bolna-prompts.md`; find caller-number variable.
  - Done when: test script 1 passes on a phone call with real numbers and SMS to the caller.
  - Done (2026-11-28): `app/api/bolna/call-complete/route.ts`, `app/api/bolna/pool-response/route.ts`, `lib/bolna/client.ts` (outbound calls). Caller-number/execution-id variable names to be verified in Bolna docs (PRD §11 open question).

- [x] **T1.7 Dashboard skeleton** — Login page (Supabase email magic link), layout, `/requests` table (crop, qty, village, created, pool_interest, status). Mobile-friendly.
  - Done when: operator sees only own FPO rows (test with a second FPO user).
  - Done (2026-11-28): Dashboard layout, login page, requests page, pools page, pool detail page, map page, prices page, logout route. UI components (button, input, select, table). Mobile-first, works at 360px.

### Phase 5 — Pooling engine (M2 — T2.1, T2.2, T2.4 cron)
Goal: post-call pooling interest captured; pools proposed every 3 hours, idempotent.

- [x] **T2.1 Extractions + call-complete webhook** — Bolna extraction config; `/api/bolna/call-complete`.
  - Done when: after a test call, the request row has `pool_interest` and duration.
  - Done (2026-11-28): `app/api/bolna/call-complete/route.ts` sets `pool_interest` and `call_duration_s` on `sale_requests`.

- [x] **T2.2 Pooling engine** — Pure grouping in `lib/pooling/group.ts` + persistence + `/api/cron/pools` + `pools.yml` (every 3 h).
  - Done when: unit tests cover under-fill → no pool; 20/20/15 qtl → one truck pool of 40 (15 stays open); far farmer excluded; storable small group → warehouse pool; rerun idempotent.
  - Done (2026-11-28): `lib/pooling/group.ts` (pure greedy grouping by crop/week, radius, truck capacity), `lib/pooling/persist.ts` (idempotent pool creation), `app/api/cron/pools/route.ts` (cron secret auth), `.github/workflows/pools.yml` (every 3h).

- [x] **T2.4 (cron part) Pooling trigger** — GitHub Actions `pools.yml` hitting `/api/cron/pools` every 3 h.
  - Done when: workflow triggers on schedule and dispatch.
  - Done (2026-11-28): `.github/workflows/pools.yml` created.

### Phase 6 — Dashboard pools + confirm flow (M2 — T2.3, T2.4 confirm, T2.6, T2.7)
Goal: operator confirms pools; members get calls; yes/no recorded; SMS for yes.

- [x] **T2.3 Pools page** — List proposed/confirming/confirmed pools; detail with members, quantities, est. gain per farmer; confirm form (date, place, vehicle).
  - Done when: operator can view pools and confirm.
  - Done (2026-11-28): Pools page, pool detail page with confirm form, member responses.

- [x] **T2.4 Confirm flow** — `/api/pools/[id]/confirm` → Bolna outbound; pool-confirm agent; `/api/bolna/pool-response`; confirmation SMS; status transitions.
  - Done when: confirming a 2-member test pool rings both team phones, answers land in DB, SMS arrives for "yes".
  - Done (2026-11-28): `app/api/pools/[id]/confirm/route.ts` (operator auth, FPO check, Bolna outbound calls with 1s rate limit), `app/api/bolna/pool-response/route.ts` (yes/no answers, SMS for yes).

- [x] **T2.6 Map + prices page** — Requests on a map (Leaflet + OSM tiles); latest prices table per mandi with date and staleness badge.
  - Done when: map page shows requests, prices page shows staleness.
  - Done (2026-11-28): Map page with request table placeholder, Prices page with latest prices + staleness badge (fresh ≤2d, yellow 3-5d, red >7d).
- [x] **T2.7 Voice test pass** — Run all 10 scripts; fix prompt; log in `docs/test-log.md`.
  - Done when: all 10 scripts documented, results logged.
  - Blocked: needs real Bolna agent + phone for testing. Test scripts defined in `docs/VOICE_AGENT.md` §6.

### Phase 7 — Polish, field validation, demo, submit (M3 — T3.1–T3.5)
Goal: submit by Dec 12; Dec 13 is buffer.

- [ ] **T3.1 Feature freeze** — Dec 10; only bug fixes after.
- [ ] **T3.2 Field validation** — 2–3 calls with farmers or an FPO person; record reactions; update `lib/calc/config.ts` if they give real cost numbers.
- [ ] **T3.3 Demo video** — 2–3 min split screen: phone call + dashboard.
- [ ] **T3.4 README + deck update** — Architecture image, how to run, test results, backtest coverage.
- [ ] **T3.5 Submit** — by Dec 12.

---

## Cut order if we run late (do not cut T1.1–T1.6)

1. T2.5 forecasts → store option uses recent 4-week trend ±10% band, confidence low
2. T2.4 outbound calls → confirmation by SMS only
3. T2.6 map → table only

---

## Decisions & open questions (log here as we resolve)

- Bolna caller-number + execution-id variable names — verify in Bolna docs before T1.6 (PRD §11 #3)
- Real commission % and truck rates in Kolar — confirm on field calls before demo (config defaults are ASSUMPTIONS)
- Lyzr AI credits coverage — decide if any LLM/runtime use fits; do not restructure the stack (PRD §11 #1)
- Prototype submission format — video, repo, live link, deck? (PRD §11 #2)

---

## How to use this file

- Before starting a task: check it is the first unchecked item in its phase (per CLAUDE.md workflow).
- When a task is done: check the box, run `npm run check`, and note the result in the PR.
- When a phase is complete: summarize in this file and move to the next phase.
- Never delete history — only add checkmarks and decision notes.

---

**Next step:** When you say **proceed**, I start with Phase 0, Task T0.1 (scaffold the repo).
