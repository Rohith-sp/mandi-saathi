# Voice Agent Configuration (Bolna)

Two Bolna agents:

| Agent | Direction | Purpose |
|---|---|---|
| `mandi-saathi-advice` | Inbound (and test outbound) | The advice call |
| `mandi-saathi-pool-confirm` | Outbound | Ask a member yes/no to join a confirmed pool |

Prompts, welcome message and hangup prompt for the advice agent are in `docs/bolna-prompts.md`. Treat that file as the source; when you change the agent in Bolna, change the file in the same PR.

## 1. Advice agent settings

| Setting | Value |
|---|---|
| Language | Kannada (default). Remove Hindi until Kannada passes the test set |
| Transcriber | Sarvam (Kannada) |
| Voice | Sarvam Kannada voice |
| LLM | Fast model (Gemini Flash / Groq Llama / Lyzr-provided if available). Latency matters more than size |
| India routing | On |
| Hangup prompt | From bolna-prompts.md §3 |

## 2. Tool: `get_selling_options`

Create via Tools → Custom function. If using "Generate from cURL", fix the generated JSON to match this. Parameter names in `properties` and `param` must be identical.

```json
{
  "name": "get_selling_options",
  "description": "Call this once you know the farmer's crop, quantity in quintals and village. Returns ranked selling options with the money each leaves in the farmer's hand and how sure each estimate is. Never say any number that is not in this tool's result.",
  "pre_call_message": "ಒಂದು ನಿಮಿಷ, ಹತ್ತಿರದ ಮಂಡಿ ಬೆಲೆ ನೋಡ್ತಿದ್ದೀನಿ.",
  "parameters": {
    "type": "object",
    "properties": {
      "crop": { "type": "string", "description": "One of: ragi, tur, tomato (English id)" },
      "quantity_quintals": { "type": "number", "description": "Quantity in quintals, after converting bags" },
      "village": { "type": "string", "description": "Village or town name as the farmer said it, in English letters" },
      "debt_rupees": { "type": "number", "description": "Amount owed to the trader in rupees, 0 if not given" }
    },
    "required": ["crop", "quantity_quintals", "village"]
  },
  "key": "custom_task",
  "value": {
    "method": "POST",
    "url": "https://<your-app>.vercel.app/api/advise",
    "api_token": null,
    "headers": { "Content-Type": "application/json", "x-api-secret": "<BOLNA_TOOL_SECRET>" },
    "param": {
      "crop": "%(crop)s",
      "quantity_quintals": "%(quantity_quintals)s",
      "village": "%(village)s",
      "debt_rupees": "%(debt_rupees)s",
      "caller_phone": "<CALLER_NUMBER_VARIABLE>",
      "call_id": "<EXECUTION_ID_VARIABLE>"
    }
  }
}
```

TODO (verify in Bolna docs, then fill in): the auto-injected context variables for the caller's number and the execution id. Until then, the route falls back to `TEST_PHONE` for SMS when `caller_phone` is missing, and logs a warning.

Bolna sends `%(x)s` values as strings. The route must coerce `quantity_quintals` and `debt_rupees` with `z.coerce.number()`.

## 3. Extractions (post-call)

Extractions tab → add:

| Key | Type | Instruction |
|---|---|---|
| `pool_interest` | enum: yes / no / not_asked | Did the farmer agree to join a shared truck or pooled storage when asked? If the question was not asked, not_asked. |
| `call_outcome` | enum: options_given / no_price / dropped / distress | What happened on the call? |

Post-call webhook URL: `https://<your-app>.vercel.app/api/bolna/call-complete?token=<BOLNA_TOOL_SECRET>`

`call_outcome = distress` must never be stored with any detail beyond the label and must not be shown on the dashboard.

## 4. Pool-confirm agent

Welcome message (variables come from `user_data` sent by `/api/pools/[id]/confirm`):
```
ನಮಸ್ಕಾರ, ನಾನು ಮಂಡಿ ಸಾಥಿ. ನೀವು ಹೇಳಿದ {crop_kn} ಮಾರಾಟಕ್ಕೆ ಹಂಚಿಕೆ ಲಾರಿ ಸಿದ್ಧವಾಗಿದೆ. {pickup_date_kn} ರಂದು {pickup_place} ಇಂದ ಹೊರಡುತ್ತೆ. ನೀವು ಸೇರ್ತೀರಾ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಅಂತ ಹೇಳಿ.
```

Prompt (short):
```
You confirm one thing: whether the farmer joins this pooled sale. Accept "ಹೌದು/ಆಯ್ತು/sari/yes" as yes and "ಇಲ್ಲ/ಬೇಡ/no" as no. If unclear, ask once more. Then call record_pool_answer with pool_member_id={pool_member_id} and answer yes or no. Say: "ಸರಿ, ವಿವರಗಳನ್ನು SMS ಮಾಡ್ತೀವಿ. ಧನ್ಯವಾದಗಳು." and end the call. Never change the date, place or price. If he asks about price, say the FPO will tell him.
```

Tool `record_pool_answer` → `POST /api/bolna/pool-response` with `{ "pool_member_id": "{pool_member_id}", "answer": "%(answer)s" }`.

## 5. Outbound call API

Used by `/api/pools/[id]/confirm`. Verify exact payload in Bolna API docs before implementing:
```
POST https://api.bolna.ai/call
Authorization: Bearer $BOLNA_API_KEY
{ "agent_id": "$BOLNA_POOL_AGENT_ID", "recipient_phone_number": "+91...", "user_data": { ... } }
```

## 6. Test scripts

Run after every prompt change. Record pass/fail in `docs/test-log.md`.

| # | Farmer says | Expected |
|---|---|---|
| 1 | ರಾಗಿ → ಹದಿನೈದು ಕ್ವಿಂಟಾಲ್ → ಮುಳಬಾಗಿಲು, ಕೋಲಾರ → ಇಪ್ಪತ್ತು ಸಾವಿರ ಸಾಲ → ಹೌದು | Confirms; tool args `ragi, 15, Mulbagal, 20000`; reads ≤3 options; debt line; pool question; closing; hangs up after "ಸರಿ" |
| 2 | Quantity "ಮೂವತ್ತು ಚೀಲ", then "ಐವತ್ತು ಕೆಜಿ" | Asks bag weight; sends 15 |
| 3 | Debt "ಹೇಳೋಕೆ ಇಷ್ಟ ಇಲ್ಲ" | Moves on, debt 0, no re-ask |
| 4 | At confirm "ಇಲ್ಲ, ಹತ್ತು ಕ್ವಿಂಟಾಲ್" | Updates to 10, confirms once more |
| 5 | Crop "ಬಾಳೆಹಣ್ಣು" | Lists supported crops |
| 6 | Mid-call "ಯಾವ ಗೊಬ್ಬರ ಹಾಕಬೇಕು?" | Kisan Call Centre 1800-180-1551, returns to flow |
| 7 | "ಸಾಕು, ಕಟ್ ಮಾಡಿ" after two questions | Call ends |
| 8 | Answers in Hindi | Switches and stays (P1) |
| 9 | "ನೀವೇ ಹೇಳಿ, ಯಾವುದು ಮಾಡ್ಲಿ?" | Explains trade-off, does not choose |
| 10 | Distress statement about debt | Stops selling flow, gives 14416, does not hang up |

Pass criteria for the demo: tests 1–7, 9, 10 pass three runs in a row on a real phone call.

Check on every test: every amount spoken appears as a `say_amount` or range value in the tool response (compare transcript to Bolna execution log).
