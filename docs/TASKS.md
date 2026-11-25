# Build Tasks

Ordered backlog. Each task is sized for one Claude Code session and one PR. Do them in order inside a milestone; milestones can overlap.

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Update this file in the same PR.

---

## M0 — Setup (26–27 Nov)

- [ ] **T0.1 Scaffold repo.** Next.js (App Router, TypeScript strict), Tailwind, zod, vitest, eslint, prettier, `@supabase/supabase-js`, `@supabase/ssr`, `twilio`. Add `.env.example`, `npm run` scripts from AGENTS.md, GitHub Actions `ci.yml` (lint, typecheck, test).
  - Done when: `npm run check` passes on a clean clone; CI green.
- [ ] **T0.2 Supabase project + migration.** Create project, enable PostGIS, apply `supabase/migrations/0001_init.sql`, generate types to `lib/supabase/types.ts`.
  - Done when: tables exist; `npm run db:types` regenerates types without diff.
- [ ] **T0.3 Seed reference data.** `scripts/seed.ts` inserts one FPO, 5–6 mandis, ~30 villages, 2–3 warehouses for the demo district. Look up real coordinates (OpenStreetMap / Google Maps); mandi names must match data.gov.in `market` strings exactly. Store the source data in `supabase/seed/*.csv`.
  - Done when: seed is idempotent; a query for mandis within 80 km of Mulbagal returns ≥ 3.
- [ ] **T0.4 Accounts and secrets.** Bolna, Twilio trial (verify team numbers), data.gov.in API key, Vercel project linked to repo. Put secrets in Vercel + GitHub Actions secrets.

## M1 — Real numbers on a real call (28 Nov – 1 Dec)

- [ ] **T1.1 Calc engine.** Implement `lib/calc` exactly per CALC_SPEC; pure functions; config in `lib/calc/config.ts`.
  - Done when: golden tests A, B, C in `tests/calc.test.ts` pass.
- [ ] **T1.2 Price ingestion.** `scripts/ingest-prices.ts` + `ingest.yml` (daily 13:00 UTC = 18:30 IST, plus `workflow_dispatch`). Cleaning rules from API.md.
  - Done when: a manual run inserts today's rows; rerun inserts nothing new; unknown markets logged.
- [ ] **T1.3 Backfill history.** Download AGMARKNET history (2–3 years, demo mandis, 3 crops) as CSV into `data/backfill/` (gitignored if large); `scripts/backfill-prices.ts` loads it with the same cleaner.
  - Done when: `prices` has ≥ 2 years for each demo mandi/crop pair or the gap is documented in `docs/data-notes.md`.
- [ ] **T1.4 `/api/advise`.** Per API.md: auth, zod (coerce numbers), village resolve, data loading, calc, save request, response. SMS after response is built.
  - Done when: route tests with mocked data return golden case A; curl against preview returns real options in < 1.5 s.
- [ ] **T1.5 SMS module.** `lib/sms` with templates (advice, pool confirm) in Kannada + numerals, ≤ 3 UCS-2 segments; `sms_log` writes. Fallback to `TEST_PHONE` when caller phone missing.
  - Done when: unit test asserts template length; real SMS received on a verified number.
- [ ] **T1.6 Connect Bolna tool.** Replace TEST MODE step with the tool per VOICE_AGENT.md §2; update prompt from `docs/bolna-prompts.md`; find caller-number variable.
  - Done when: test script 1 passes on a phone call with real numbers and SMS to the caller.
- [ ] **T1.7 Dashboard skeleton.** Login page (Supabase email magic link), layout, `/requests` table (crop, qty, village, created, pool_interest, status). Mobile-friendly.
  - Done when: operator sees only own FPO rows (test with a second FPO user).

**Checkpoint 1 Dec:** call → real options → SMS. Record a backup video of this.

## M2 — Pooling and dashboard (2–8 Dec)

- [ ] **T2.1 Extractions + call-complete webhook.** Bolna extraction config; `/api/bolna/call-complete`.
  - Done when: after a test call, the request row has `pool_interest` and duration.
- [ ] **T2.2 Pooling engine.** Pure grouping in `lib/pooling/group.ts` + persistence + `/api/cron/pools` + `pools.yml` (every 3 h).
  - Done when: unit tests cover: under-fill → no pool; farmers of 20, 20, 15 qtl nearby → one truck pool of 40 (15 would overflow 50) and the 15 stays open; far farmer excluded; storable small group → warehouse pool; rerun idempotent.
- [ ] **T2.3 Pools page.** List proposed/confirming/confirmed pools; detail with members, quantities, target, estimated gain per farmer (from stored options); confirm form (date, place, vehicle).
- [ ] **T2.4 Confirm flow.** `/api/pools/[id]/confirm` → Bolna outbound; pool-confirm agent; `/api/bolna/pool-response`; confirmation SMS; status transitions.
  - Done when: confirming a 2-member test pool rings both team phones, answers land in DB, SMS arrives for "yes".
- [ ] **T2.5 Forecasts.** `scripts/compute-forecasts.ts` + weekly workflow + `scripts/backtest.ts` printing coverage.
  - Done when: forecasts exist for demo pairs; coverage number written in `docs/data-notes.md`.
- [ ] **T2.6 Map + prices page.** Requests on a map (Leaflet + OSM tiles); latest prices table per mandi with date and staleness badge.
- [ ] **T2.7 Voice test pass.** Run all 10 scripts; fix prompt; log in `docs/test-log.md`.

## M3 — Prove and package (9–13 Dec)

- [ ] **T3.1 Feature freeze 10 Dec.** Only bug fixes after this.
- [ ] **T3.2 Field validation.** 2–3 calls with farmers or an FPO person; note their reaction and any cost constants they correct; update `lib/calc/config.ts` if they give real numbers.
- [ ] **T3.3 Demo video (2–3 min).** Split screen: phone call + dashboard. Script: farmer call → options → SMS → request on dashboard → pool forms → confirm → member phone rings → SMS.
- [ ] **T3.4 README + deck update.** Architecture image, how to run, test results, backtest coverage.
- [ ] **T3.5 Submit by 12 Dec.** 13 Dec is buffer.

## Cut order if late
1. T2.5 forecasts → store option uses recent 4-week trend ±10% band, confidence low
2. T2.4 outbound calls → confirmation by SMS only
3. T2.6 map → table only
4. Never cut T1.1–T1.6.
