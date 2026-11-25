# AGENTS.md

Instructions for AI coding agents (Claude Code and others) working in this repo. Humans: read this too.

## What this is

Mandi Saathi: a voice agent that tells small farmers what each selling option leaves in their hand, and pools nearby farmers so shared trucks and warehouse loans become reachable. Farmer side is a phone call (Bolna + Sarvam) and SMS (Twilio). Operator side is a Next.js dashboard. Data is Supabase Postgres + PostGIS.

Before changing anything, read the doc that governs it:

| Working on | Read first |
|---|---|
| Any number the farmer hears | `docs/CALC_SPEC.md` |
| An API route or webhook | `docs/API.md` |
| Schema, queries, RLS | `docs/ARCHITECTURE.md` §2–4, `supabase/migrations/` |
| Bolna prompts, tools, extractions | `docs/VOICE_AGENT.md`, `docs/bolna-prompts.md` |
| What to build next | `docs/TASKS.md` |
| Why something exists | `docs/PRD.md` |

## Stack

Next.js (App Router, TypeScript strict) on Vercel · Tailwind · zod · Supabase (`@supabase/supabase-js`, `@supabase/ssr`) · PostGIS · Twilio · vitest · GitHub Actions for scheduled jobs. Node 20+. Package manager: npm.

Check current library docs (Context7 or official docs) before using Next.js, Supabase or Twilio APIs; do not rely on memory for API shapes.

## Commands

```bash
npm run dev          # local dev server
npm run lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run check        # lint + typecheck + test (run before every commit)
npm run db:types     # regenerate lib/supabase/types.ts from Supabase
npm run ingest       # tsx scripts/ingest-prices.ts
npm run forecasts    # tsx scripts/compute-forecasts.ts
npm run backtest     # tsx scripts/backtest.ts
```

If a script is missing, add it to `package.json` rather than running ad-hoc commands.

## Invariants (do not break)

1. **The LLM never computes numbers.** Every amount the farmer hears comes from `/api/advise` output. Do not add prompt logic that does arithmetic beyond bags→quintals.
2. **`lib/calc` is pure.** No I/O, no Supabase, no `fetch`, no `Date.now()` (pass `today` in). Same inputs → same outputs.
3. **Units:** quantity in quintals, prices in ₹/quintal, money in whole rupees at output, dates in Asia/Kolkata. Name variables with units when ambiguous (`priceRsPerQtl`, `distanceKm`).
4. **Config lives in one place:** `lib/calc/config.ts`. No magic numbers in routes or components.
5. **Golden tests must pass.** If you change a formula, update CALC_SPEC in the same change and explain the new numbers.
6. **No recommendation.** Responses rank options; they never say which one to choose.
7. **Uncertainty is always present.** Every option has a confidence; future prices are ranges.
8. **Live calls read only our DB.** No data.gov.in or Open-Meteo calls inside `/api/advise`.
9. **SMS failure never fails a request.** Log to `sms_log` and continue.

## Security rules

- Every Bolna-facing route checks the secret with `lib/auth.ts` (constant-time compare). Every cron route checks `CRON_SECRET`.
- `SUPABASE_SERVICE_ROLE_KEY` only in server code. Files under `lib/data` start with `import "server-only"`.
- Validate all request bodies with zod. Coerce numbers (Bolna sends strings).
- Never log full phone numbers, debt amounts, or call transcripts. Use `maskPhone()`.
- Dashboard data goes through RLS (anon key + user session). Route handlers that mutate pools re-check the operator's FPO.
- Never commit `.env*` files other than `.env.example`.

## Code conventions

- Server components by default; `"use client"` only where interaction needs it.
- Route handlers: parse → authorize → call a function in `lib/` → return. Keep business logic out of `route.ts`.
- Errors: return `{ error: "<snake_code>" }` with the right status. Statuses the agent must speak (`no_price`, `needs_clarification`, `unsupported_crop`) are HTTP 200 with a `status` field.
- DB access: typed Supabase client with generated types. Spatial queries via SQL functions (`supabase.rpc`) rather than string-built SQL.
- Tests next to the domain in `tests/`, named `<area>.test.ts`.
- Small PRs, one TASKS item each. Update the task checkbox in the same PR.
- Dashboard UI: plain, readable, works at 360 px wide. Kannada labels for crops come from `crops.name_kn`.

## Do not

- Do not add an ORM, state library, or UI kit beyond Tailwind without a written reason in the PR.
- Do not add ML models or LLM calls to the backend for the prototype.
- Do not build a farmer-facing app or text input channel.
- Do not invent mandi names, coordinates, prices or cost constants. If data is missing, leave a TODO and say so.
- Do not edit applied migrations; add a new numbered migration.
- Do not hand-edit `lib/supabase/types.ts`.

## When unsure

Prefer the smallest change that satisfies the task's "Done when". If a requirement conflicts with these docs, stop and ask rather than guessing.
