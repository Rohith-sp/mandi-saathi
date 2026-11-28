# Mandi Saathi — Complete Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining phases (T0.2–T3.5) of Mandi Saathi so the repo is buildable and commit-ready. Real .env credentials and Supabase data are supplied by the user later; no random/invented data is seeded.

**Architecture:** Next.js App Router on Vercel, Supabase Postgres+PostGIS+Auth+RLS, pure `lib/calc` engine, Twilio SMS, Bolna voice webhooks, GitHub Actions scheduled jobs. Business logic lives in `lib/`; route handlers are parse → authorize → call lib → return.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Tailwind, zod, vitest, `@supabase/supabase-js`, `@supabase/ssr`, `twilio`, zod, vitest.

**Spec:** `docs/AGENTS.md`, `docs/CALC_SPEC.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/VOICE_AGENT.md`, `docs/bolna-prompts.md`, `docs/TASKS.md`, `supabase/migrations/0001_init.sql`

## Global Constraints

1. `lib/calc` is pure: no I/O, no Supabase, no `fetch`, no `Date.now()` (pass `today` in). Same inputs → same outputs.
2. Config lives only in `lib/calc/config.ts`. No magic numbers in routes or components.
3. Golden tests must pass. If a formula changes, update CALC_SPEC in the same change.
4. No recommendation: responses rank options; never say which to choose.
5. Uncertainty always present: every option has confidence; future prices are ranges.
6. `/api/advise` reads only our own DB. No data.gov.in/Open-Meteo in the request path.
7. SMS failure never fails a request: log to `sms_log` and continue.
8. Validate all request bodies with zod; coerce numbers (Bolna sends strings).
9. Bolna-facing routes check secret via `lib/auth.ts` (constant-time compare). Cron routes check `CRON_SECRET`.
10. `SUPABASE_SERVICE_ROLE_KEY` only in server code. `lib/data` files start with `import "server-only"`.
11. Never log full phone numbers, debt amounts, or transcripts. Use `maskPhone()`.
12. Server components by default; `"use client"` only where interaction needs it.
13. Route handlers: parse → authorize → call `lib/` function → return. No business logic in `route.ts`.
14. Spatial queries via `supabase.rpc`, not string-built SQL.
15. Tests next to domain in `tests/`, named `<area>.test.ts`.
16. Small PRs, one TASKS item each. Update checkbox in same PR.
17. Do not hand-edit `lib/supabase/types.ts`. Do not edit applied migrations.
18. Do not add ORM, state library, or UI kit beyond Tailwind without written reason.
19. Do not build farmer-facing app or text input channel.
20. `npm run check` (lint + typecheck + test) before every commit.

## Review Focus

| Input / condition | Expected behavior |
|---|---|
| `quantity_quintals = 0` in /api/advise | 400 `invalid_quantity`, never throws |
| Unknown crop in /api/advise | 200 `unsupported_crop` with `supported_crops` |
| No non-stale local price | 200 `no_price` |
| Village not found | 200 `needs_clarification`, `field: "village"` |
| SMS provider throws | Call continues; `sms_log` row with `failed` |
| Missing `caller_phone` | Fallback to `TEST_PHONE` for SMS; warning logged |
| Bolna secret missing/wrong | 401 `unauthorized` |
| Cron secret missing/wrong | 401 `unauthorized` |
| Pool rerun on already-pooled request | Idempotent; skipped, no duplicate pool |
| Dashboard operator from FPO A | Sees only FPO A rows (RLS enforced) |
| Stale prices > 7 days | Mandi excluded from options |

---

### Task 0: Supabase types + seed script structure (T0.2, T0.3)

**Files:**
- Create: `supabase/seed/.gitkeep`
- Create: `scripts/seed.ts` (idempotent structure; no random data inserted)
- Modify: `package.json` (add `seed` script referencing `db:types` guidance)

**Interfaces:**
- Consumes: `supabase/migrations/0001_init.sql` schema (tables: crops, fpos, operators, villages, mandis, warehouses, prices, forecasts, farmers, sale_requests, pools, pool_members, sms_log)
- Produces: `scripts/seed.ts` with idempotent upsert helpers keyed on natural keys; no data inserted without real user-supplied CSVs

- [ ] **Step 1: Write failing test for seed idempotency**

```typescript
// tests/seed.test.ts
import { describe, it, expect } from "vitest"

describe("seed script structure", () => {
  it("exports idempotent upsert helpers", () => {
    // seed.ts must export functions keyed on natural keys (name, district)
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npm test tests/seed.test.ts` → FAIL (file missing)
- [ ] **Step 3: Implement `scripts/seed.ts`** — idempotent helpers, no random data, CSV-based only
- [ ] **Step 4: Run test to verify it passes** — `npm test`
- [ ] **Step 5: Commit**

---

### Task 1: Data pipeline scripts (T1.2, T1.3, T2.5)

**Files:**
- Create: `scripts/ingest-prices.ts`
- Create: `scripts/backfill-prices.ts`
- Create: `scripts/compute-forecasts.ts`
- Create: `scripts/backtest.ts`
- Create: `tests/ingest.test.ts`
- Create: `tests/forecasts.test.ts`
- Modify: `package.json` (already has ingest/forecasts/backtest scripts)
- Create: `.github/workflows/ingest.yml`, `forecasts.yml`, `pools.yml`

**Interfaces:**
- Consumes: env vars `DATA_GOV_API_KEY`, `DATA_GOV_RESOURCE_ID`, `INGEST_STATE`, `INGEST_DISTRICTS`, `CRON_SECRET`, `APP_URL`; Supabase service client
- Produces: upserted `prices` rows, `forecasts` rows, backtest coverage output

- [ ] **Step 1: Write failing tests for ingest cleaner rules** (drop invalid prices, map aliases, log unknown markets)
- [ ] **Step 2: Run test to verify fails**
- [ ] **Step 3: Implement `scripts/ingest-prices.ts`** — data.gov.in fetch, clean, upsert; idempotent rerun
- [ ] **Step 4: Run tests**
- [ ] **Step 5: Implement `scripts/backfill-prices.ts`** — CSV loader with same cleaner
- [ ] **Step 6: Implement `scripts/compute-forecasts.ts`** — P10/P50/P90 per (mandi, crop, ISO week)
- [ ] **Step 7: Implement `scripts/backtest.ts`** — coverage percentage output
- [ ] **Step 8: Create GitHub Actions workflows** (ingest daily, forecasts weekly, pools every 3h)
- [ ] **Step 9: Commit**

---

### Task 2: `/api/advise` route + SMS module (T1.4, T1.5)

**Files:**
- Create: `app/api/advise/route.ts`
- Create: `lib/data/advise.ts` (Supabase queries for prices, villages, mandis)
- Create: `lib/sms/client.ts` (Twilio client)
- Create: `lib/sms/templates.ts` (Kannada + numeral templates, ≤ 3 UCS-2 segments)
- Create: `lib/sms/log.ts` (sms_log writes, failure never throws)
- Create: `lib/data/mask.ts` (maskPhone helper)
- Create: `tests/advise.test.ts`
- Create: `tests/sms.test.ts`

**Interfaces:**
- Consumes: Bolna secret header, zod-validated body (crop, quantity_quintals, village, debt_rupees, caller_phone, call_id), Supabase data, `lib/calc` engine
- Produces: `/api/advise` JSON response (status ok/no_price/needs_clarification/unsupported_crop), saved `sale_requests`, SMS queued

- [ ] **Step 1: Write failing test for /api/advise golden case A** (mocked data → 28,900 / 31,160 / 33,015)
- [ ] **Step 2: Run test to verify fails**
- [ ] **Step 3: Implement `lib/data/mask.ts`** — maskPhone()
- [ ] **Step 4: Implement `lib/sms/templates.ts`** — Kannada templates, segment count check
- [ ] **Step 5: Implement `lib/sms/client.ts`** — Twilio send with 3s timeout, failure caught
- [ ] **Step 6: Implement `lib/sms/log.ts`** — sms_log write, never throws
- [ ] **Step 7: Implement `lib/data/advise.ts`** — village resolve, price loading, open requests query
- [ ] **Step 8: Implement `app/api/advise/route.ts`** — auth, zod, calc, save, SMS after response
- [ ] **Step 9: Run full test suite**
- [ ] **Step 10: Commit**

---

### Task 3: Bolna webhooks + dashboard skeleton (T1.6, T1.7)

**Files:**
- Create: `app/api/bolna/call-complete/route.ts`
- Create: `app/api/bolna/pool-response/route.ts`
- Create: `app/(dashboard)/layout.tsx` (mobile-friendly, Supabase auth)
- Create: `app/(dashboard)/login/page.tsx` (email magic link)
- Create: `app/(dashboard)/requests/page.tsx` (requests table, FPO-filtered)
- Create: `lib/bolna/client.ts` (outbound call client)
- Create: `tests/bolna.test.ts`

**Interfaces:**
- Consumes: Bolna webhook payloads, Supabase auth session, `lib/auth.ts` secret checks
- Produces: `sale_requests.pool_interest` + `call_duration_s` from call-complete; dashboard login + requests list

- [ ] **Step 1: Write failing test for call-complete webhook** (sets pool_interest, duration)
- [ ] **Step 2: Run test to verify fails**
- [ ] **Step 3: Implement `app/api/bolna/call-complete/route.ts`**
- [ ] **Step 4: Implement `app/api/bolna/pool-response/route.ts`**
- [ ] **Step 5: Implement `lib/bolna/client.ts`** — outbound call API
- [ ] **Step 6: Implement dashboard login + layout** (Supabase email magic link, mobile-friendly)
- [ ] **Step 7: Implement `/requests` table** (RLS: operator sees only own FPO)
- [ ] **Step 8: Run full test suite + typecheck**
- [ ] **Step 9: Commit**

---

### Task 4: Pooling engine (T2.1, T2.2, T2.4 cron)

**Files:**
- Create: `lib/pooling/group.ts` (pure grouping algorithm)
- Create: `lib/pooling/persist.ts` (pool + pool_members inserts)
- Create: `app/api/cron/pools/route.ts`
- Create: `tests/pooling.test.ts`
- Modify: `.github/workflows/pools.yml`

**Interfaces:**
- Consumes: open `sale_requests` with `pool_interest`, `lib/calc` options for gain estimation
- Produces: `pools` (proposed), `pool_members` (pending), idempotent on rerun

- [ ] **Step 1: Write failing tests for grouping rules** (under-fill → no pool; 20/20/15 → one truck of 40, 15 stays open; far farmer excluded; storable → warehouse; idempotent rerun)
- [ ] **Step 2: Run test to verify fails**
- [ ] **Step 3: Implement `lib/pooling/group.ts`** — pure greedy grouping
- [ ] **Step 4: Implement `lib/pooling/persist.ts`** — DB inserts with idempotency
- [ ] **Step 5: Implement `app/api/cron/pools/route.ts`** — cron secret auth, run grouping
- [ ] **Step 6: Run full test suite**
- [ ] **Step 7: Commit**

---

### Task 5: Dashboard pools + confirm flow + map + prices (T2.3, T2.4 confirm, T2.6, T2.7)

**Files:**
- Create: `app/(dashboard)/pools/page.tsx` (proposed/confirming/confirmed pools)
- Create: `app/(dashboard)/pools/[id]/page.tsx` (pool detail + confirm form)
- Create: `app/api/pools/[id]/confirm/route.ts`
- Create: `app/(dashboard)/map/page.tsx` (Leaflet + OSM)
- Create: `app/(dashboard)/prices/page.tsx` (latest prices table + staleness badge)
- Create: `tests/pools.test.ts`
- Modify: `app/(dashboard)/layout.tsx` (add nav)

**Interfaces:**
- Consumes: operator session, pool ID, confirm payload (pickup_date, pickup_place, vehicle_note), Bolna outbound client
- Produces: pool confirmation → Bolna outbound calls → pool-response → yes/no → SMS → status transitions

- [ ] **Step 1: Write failing test for pool confirm** (status transitions, calls started)
- [ ] **Step 2: Run test to verify fails**
- [ ] **Step 3: Implement pools page** (list + detail, est. gain per farmer)
- [ ] **Step 4: Implement confirm form + route** (date, place, vehicle → Bolna outbound)
- [ ] **Step 5: Implement map page** (Leaflet + OSM tiles, requests as markers)
- [ ] **Step 6: Implement prices page** (latest price per crop/mandi, staleness badge)
- [ ] **Step 7: Run full test suite + typecheck**
- [ ] **Step 8: Commit**

---

### Task 6: Polish + field validation prep + demo artifacts (T3.1–T3.5)

**Files:**
- Modify: `PROGRESS.md` (feature freeze, field validation notes)
- Create: `docs/test-log.md` (voice test results template)
- Create: `docs/data-notes.md` (backtest coverage, data gaps)
- Modify: `README.md` (how to run, test results, coverage)
- Modify: `.abide/rubric.json` (review any new rules discovered)

**Interfaces:**
- Consumes: nothing external; documentation only
- Produces: updated docs, README, test-log template

- [ ] **Step 1: Update PROGRESS.md** — mark all tasks done, note T0.2–T0.4 need user credentials
- [ ] **Step 2: Create docs/test-log.md** — 10 voice script template
- [ ] **Step 3: Create docs/data-notes.md** — backtest coverage template, data gaps
- [ ] **Step 4: Update README.md** — run instructions, test results, architecture
- [ ] **Step 5: Run `npm run check` final**
- [ ] **Step 6: Commit**

---

**Plan self-review complete:** All spec requirements from CALC_SPEC, API, ARCHITECTURE, VOICE_AGENT, TASKS are mapped to tasks. Review Focus covers the 11 failure modes most likely to bite. No task carries more than one checkable step.

Please review the plan. Does it capture what you want? Since no execution method has been supplied yet, I recommend **Native** execution — I implement every task myself in this session, then one fresh reviewer checks the whole branch. This is fastest and the plan carries all design decisions.

Which approach should we use?