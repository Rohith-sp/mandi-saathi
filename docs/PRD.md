# Mandi Saathi — Product Requirements Document

| | |
|---|---|
| Team | Quantum Pickles |
| Event | Tech4Bharat, GAVS 2026 — Agriculture and Food Processing, Problem 6.1 |
| Prototype deadline | 13 December 2026 |
| Grand finale | 27 December 2026, Bangalore Palace |
| Status | Prototyping stage (shortlisted after idea round) |
| Last updated | 25 November 2026 |

## 1. Problem

Small and marginal farmers with 10–20 quintals usually sell to the local commission agent or trader at that day's quoted price. Often the trader is the same person who advanced seeds and inputs on credit. The problem statement puts the loss at ₹5,000–20,000 per selling cycle, with 20–30% post-harvest loss from poor storage and timing.

Price information alone does not fix this. Price apps already list rates at other mandis. A small farmer still cannot use a better price because:

1. **Transport does not scale down.** A truck costs about the same for 10 quintals as for 50, so a small lot loses most of the price gain at a farther mandi.
2. **Storage credit has a floor.** Pledge loans against e-NWR warehouse receipts exist (about 7% p.a. for KCC holders, 75% loan-to-value), but SBI's minimum agricultural pledge loan is ₹1 lakh. One small farmer's lot rarely reaches it.
3. **Debt ties him to the trader.** Input credit decides where he sells.

## 2. Product summary

Mandi Saathi is a phone line. The farmer calls from any phone and speaks in his own language. He says his crop, quantity and village, and optionally what he owes the trader. The agent tells him what each option leaves in his hand after commission, transport, spoilage, warehouse charges and interest, with how sure each estimate is. It groups him with nearby farmers selling the same crop in the same week so a shared truck or a pooled warehouse deposit becomes possible. He hears the options on the call and gets them again by SMS. He makes the decision.

The FPO (Farmer Producer Organisation) operator uses a web dashboard to review proposed pools, book the truck or warehouse slot, and confirm, which triggers confirmation calls to the members.

## 3. Users

| User | Context | What they need |
|---|---|---|
| Farmer (primary) | Small/marginal, 2–20 quintals per sale, basic phone, may not read, patchy network, often owes the trader | The money each option leaves in hand, in his language, without an app |
| FPO operator | Runs the local FPO, comfortable with a smartphone or laptop, coordinates members | One place to see who wants to sell what, form pools, book trucks and storage |
| Bank / NBFC (indirect) | Wants pledge-loan borrowers; uptake is low | Pooled deposits large enough to lend against |

## 4. Goals and non-goals

### Goals (prototype, by 13 Dec)
- G1. A farmer completes an advice call end to end and hears 2–3 options with real mandi prices.
- G2. Every amount spoken is computed by the backend and is reproducible from the inputs.
- G3. The farmer receives an SMS with the same numbers within one minute of the call.
- G4. Farmers who say yes to pooling appear in proposed pools on the FPO dashboard.
- G5. Confirming a pool on the dashboard triggers outbound calls and records yes/no answers.

### Non-goals (prototype)
- Payments, bank integration, or actually filing loan applications.
- Truck booking with real transporters (the operator records it manually).
- A farmer-facing app or text input. Farmer input is voice only.
- Price prediction beyond historical percentile ranges. No ML model training.
- Covering every crop and district. The demo dataset uses one district cluster and 3 crops.

## 5. Scope for the prototype

Demo dataset (an example, not a product limit): Kolar-area mandis, crops ragi, tur and tomato, Kannada as the call language. These were chosen because they cover both cases: tomato (perishable, where a shared truck matters) and ragi/tur (storable, where the warehouse loan matters).

## 6. Functional requirements

Priority: **P0** must ship for the demo, **P1** should ship, **P2** roadmap only.

### 6.1 Advice call (voice)
| ID | Requirement | P |
|---|---|---|
| V1 | Inbound voice call on Bolna, Kannada STT/TTS through Sarvam | P0 |
| V2 | Agent collects crop, quantity, village, debt (debt optional and skippable) one question at a time | P0 |
| V3 | If quantity is given in bags, agent asks bag weight and converts to quintals; never guesses | P0 |
| V4 | Agent confirms crop, quantity and village once before calling the backend | P0 |
| V5 | Agent calls exactly one tool, `get_selling_options`, and speaks only numbers returned by it | P0 |
| V6 | Agent reads at most 3 options, best first, each with a confidence phrase | P0 |
| V7 | Agent says "the decision is yours" after the options and never recommends | P0 |
| V8 | Agent asks if the farmer wants to join a shared truck/deposit when the tool returns `pool_available: true` | P0 |
| V9 | Stale prices (older than 2 days) are called out | P0 |
| V10 | Off-topic questions are redirected to Kisan Call Centre 1800-180-1551 | P1 |
| V11 | Distress handling: stop selling flow, give Tele-MANAS 14416, never auto-hang-up | P0 |
| V12 | Language switch to Hindi/English if the farmer speaks it | P1 |
| V13 | Missed-call → callback | P2 |

### 6.2 Advice engine (backend)
| ID | Requirement | P |
|---|---|---|
| A1 | `POST /api/advise` computes options per `docs/CALC_SPEC.md` | P0 |
| A2 | Options: sell local, sell far alone, sell far pooled, store + loan (storable crops only) | P0 |
| A3 | Future values as P10/P50/P90 ranges; same-day sales as single values | P0 |
| A4 | Confidence label per option, per rules in CALC_SPEC | P0 |
| A5 | Debt note: per-quintal gap between local (trader) option and best option, when debt > 0 | P1 |
| A6 | Every request saved as a `sale_requests` row with inputs and computed options | P0 |
| A7 | p95 latency under 1.5 s (calls only read our own DB) | P0 |
| A8 | Unknown village → resolve via villages table; if not found, ask again (tool returns `needs_clarification`) | P1 |

### 6.3 SMS
| ID | Requirement | P |
|---|---|---|
| S1 | Summary SMS to the caller's number after `/api/advise` | P0 |
| S2 | Pool confirmation SMS with date, place, truck/warehouse details | P1 |
| S3 | SMS failure never fails the call; it is logged | P0 |
| S4 | Kannada text kept under 3 SMS segments (UCS-2, 70 chars/segment) | P1 |

### 6.4 Pooling
| ID | Requirement | P |
|---|---|---|
| P1 | Post-call extraction of `pool_interest` saved on the sale request | P0 |
| P2 | Pooling job groups open requests by crop, sale week, 15 km radius | P0 |
| P3 | Truck pool proposed when total ≥ 60% of truck capacity | P0 |
| P4 | Warehouse pool proposed for storable crops when pooled value ≥ loan minimum / LTV | P1 |
| P5 | Operator confirm triggers outbound Bolna calls to each member | P1 |
| P6 | Yes/no answers recorded per member; pool status updates | P1 |

### 6.5 FPO dashboard
| ID | Requirement | P |
|---|---|---|
| D1 | Email login (Supabase Auth); operator sees only own FPO's farmers | P0 |
| D2 | Sale requests list (table), filter by crop/week/status | P0 |
| D3 | Map view of requests | P1 |
| D4 | Proposed pools with members, total quantity, est. per-farmer gain | P0 |
| D5 | Confirm pool: enter date, place, vehicle/warehouse note → triggers calls + SMS | P0 |
| D6 | Mandi price view: latest modal price per crop per mandi, with date | P1 |
| D7 | Works on a phone screen (PWA installable) | P1 |

### 6.6 Data
| ID | Requirement | P |
|---|---|---|
| R1 | Daily ingestion of mandi prices from data.gov.in into `prices` | P0 |
| R2 | Historical prices loaded for forecast ranges (backfill) | P0 |
| R3 | Weekly forecast recompute into `forecasts` | P1 |
| R4 | Open-Meteo rain warning cached per district | P2 |

## 7. Non-functional requirements

- **Correctness:** all money as integer rupees after rounding; all quantities in quintals; all dates in Asia/Kolkata.
- **Honesty:** no number reaches the farmer unless the backend produced it. The LLM prompt forbids invented numbers; tests check transcripts against tool output.
- **Latency:** `/api/advise` p95 < 1.5 s. No external API calls inside the request path except Twilio (fire-and-forget after response data is built).
- **Security:** webhook endpoints require a shared secret header; dashboard uses Supabase RLS; service-role key server-side only; no secrets in client bundles.
- **Privacy:** phone numbers and debt amounts are personal data. Not logged in plain text in application logs. Debt stored only on the sale request.
- **Cost:** stays inside free tiers / trial credits for the prototype.
- **Resilience:** if prices for a mandi are older than 7 days, that mandi is excluded. If the backend fails, the agent apologises and promises a callback.

## 8. Success metrics (prototype)

| Metric | Target |
|---|---|
| Slot extraction accuracy on the 10-script test set | ≥ 9/10 calls correct crop, qty, village |
| Spoken numbers matching tool output | 100% of test calls |
| Calc engine golden tests | 100% pass |
| Forecast backtest coverage (actual price inside P10–P90) | 70–90% (report the measured value) |
| End-to-end call to SMS received | < 60 s |
| Field validation | 2–3 real farmer or FPO calls, reactions recorded |

## 9. Business model (for the pitch)

The farmer pays nothing. FPOs pay a monthly dashboard subscription. Banks and NBFCs pay a referral fee for pledge-loan applications from pooled deposits. A small fee on pooled truck bookings. Calls and SMS cost roughly ₹20–40 per farmer per season.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| data.gov.in daily API returns only current day, gaps on many days | Start daily ingestion immediately; backfill history from AGMARKNET exports; exclude stale mandis |
| Bolna trial credits run out | Use web calls for dev testing, phone calls only for scripted tests and demo; check credits weekly |
| Kannada STT mishears village names | Add district village list to agent prompt; confirm step; `needs_clarification` path |
| Twilio international route drops SMS to some Indian carriers | Test on Jio and Airtel; demo phone on the carrier that works; mention DLT for production |
| Vercel Hobby crons run at most daily | Run pooling job from GitHub Actions on a schedule hitting a protected endpoint |
| Cost constants (commission, truck rate) are assumptions | Keep in one config file; validate with 2–3 field calls; say so in the pitch |
| Live demo network failure | Pre-recorded demo video as backup |

## 11. Open questions

1. Lyzr AI credits: what do they cover? If they include an LLM or agent runtime, decide whether the Bolna agent's LLM or a post-call summariser uses it. Do not restructure the stack around it.
2. Prototype submission format (video, repo, live link, deck)? Ask in the WhatsApp group.
3. Bolna: exact variable name for the caller's number inside custom function calls, and the outbound call API payload. Verify in Bolna docs.
4. Real commission % and truck rates in the Kolar area — confirm on field calls.

## 12. Roadmap (post-prototype)

Missed-call callback, post-sale price feedback call, Hindi and Telugu, WhatsApp voice-note channel, more districts, DLT-registered SMS sender, bank partner integration for pledge-loan applications.
