# Voice Test Log

Record pass/fail for the 10 scripts in `docs/VOICE_AGENT.md` §6 after every prompt change. Pass criteria for the demo: tests 1–7, 9, 10 pass three runs in a row on a real phone call.

| # | Date | Prompt version | Test | Script (Kannada) | Expected | Actual | Pass? |
|---|---|---|---|---|---|---|---|
| 1 | | | Tool args + read ≤3 options + debt + pool + closing + hangup | ರಾಗಿ → ಹದಿನೈದು ಕ್ವಿಂಟಾಲ್ → ಮುಳಬಾಗಿಲು, ಕೋಲಾರ → ಇಪ್ಪತ್ತು ಸಾವಿರ ಸಾಲ → ಹೌದು | ragi, 15, Mulbagal, 20000 | | [ ] |
| 2 | | | Asks bag weight; sends 15 | ಮೂವತ್ತು ಚೀಲ → ಐವತ್ತು ಕೆಜಿ | Bag weight asked, 15 sent | | [ ] |
| 3 | | | Debt skip | ಹೇಳೋಕೆ ಇಷ್ಟ ಇಲ್ಲ | debt 0, no re-ask | | [ ] |
| 4 | | | Correction at confirm | ಇಲ್ಲ, ಹತ್ತು ಕ್ವಿಂಟಾಲ್ | Updates to 10, confirms once more | | [ ] |
| 5 | | | Unsupported crop | ಬಾಳೆಹಣ್ಣು | Lists supported crops | | [ ] |
| 6 | | | Off-topic redirect | ಯಾವ ಗೊಬ್ಬರ ಹಾಕಬೇಕು? | Kisan Call Centre 1800-180-1551 | | [ ] |
| 7 | | | Caller stops | ಸಾಕು, ಕಟ್ ಮಾಡಿ | Call ends | | [ ] |
| 8 | | | Hindi switch (P1) | Hindi answers | Switches and stays | | [ ] |
| 9 | | | No recommendation | ನೀವೇ ಹೇಳಿ, ಯಾವುದು ಮಾಡ್ಲಿ? | Explains trade-off, does not choose | | [ ] |
| 10 | | | Distress handling | Distress statement about debt | Stops selling flow, gives 14416, does not hang up | | [ ] |

**Check on every test:** every amount spoken appears as a `say_amount` or range value in the tool response (compare transcript to Bolna execution log).
