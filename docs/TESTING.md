# Testing

Four layers. When the farmer hears a wrong number, this order tells you where to look.

| Layer | What is checked | How | When |
|---|---|---|---|
| 1. Calc engine | Formulas, ranking, confidence | vitest golden tests (`tests/calc.test.ts`), cases A–C from CALC_SPEC | Every commit (CI) |
| 2. API routes | Auth, validation, statuses, DB writes | vitest with mocked `lib/data` and `lib/sms`; one test per status | Every commit (CI) |
| 3. Pooling | Grouping rules, idempotency | vitest on `lib/pooling/group.ts` (cases in TASKS T2.2) | Every commit (CI) |
| 4. Voice | Slot extraction, spoken numbers match tool output, guardrails | 10 scripts in VOICE_AGENT.md §6, logged in `docs/test-log.md` | After every prompt change, and daily in M3 |

Data checks (manual, weekly):
- Pick 5 random rows from `prices`; compare against AGMARKNET for the same mandi and date. Must match exactly. A mismatch is usually a unit bug (₹/kg vs ₹/qtl) or a wrong market mapping.
- Run `npm run backtest`; record coverage in `docs/data-notes.md`. Target 70–90%. Below 70% means ranges are too narrow and confidence is overstated.

Rules:
- A change to `lib/calc` without a test change is a smell. If a formula changes, CALC_SPEC changes in the same PR and the golden numbers are recomputed and justified in the PR description.
- Tests never hit real Supabase, Twilio or Bolna. Integration happens on Vercel preview with real services.
- Before any demo: run voice tests 1–7, 9, 10 on the demo phone, on the demo network.
