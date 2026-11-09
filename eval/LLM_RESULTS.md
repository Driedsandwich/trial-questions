# LLM rewriting path: live sample

Data from ClinicalTrials.gov. Started: 2026-11-09T03:04:48.188Z. Finished: 2026-11-09T03:20:28.784Z. Model: gemini-3.5-flash-lite (OpenAI-compatible chat completions endpoint on generativelanguage.googleapis.com).

## Method

Same live sampling as eval/run.ts (recruiting trials, up to 10 per condition, API relevance order; 50 trials used). From each trial, the first 2 inclusion and first 2 exclusion items were rewritten through the optional LLM path in src/plain.ts, with the same gates as the app: every number, unit and comparison token must be preserved in order, eligibility claims are blocked, and the output must be exactly one question. Any rejected rewrite displays the original text instead. No criteria or rewritten text are stored here; only counts. Readability is the Flesch–Kincaid grade from eval/readability.ts (a rough heuristic, not proof of understanding).

| Condition | Items | Accepted questions | Rejected: numbers | Rejected: claim | Rejected: shape | Errors | Original FK (accepted) | Question FK (accepted) | Original FK (all) | Displayed FK (all) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| breast cancer | 40 | 32/40 (80.0%) | 8 | 0 | 0 | 0 | 13.03 | 10.13 | 12.27 | 9.96 |
| type 2 diabetes | 39 | 24/39 (61.5%) | 15 | 0 | 0 | 0 | 12.44 | 9.92 | 13.26 | 11.71 |
| asthma | 40 | 29/40 (72.5%) | 8 | 2 | 1 | 0 | 13.62 | 11.28 | 13.76 | 12.07 |
| rheumatoid arthritis | 40 | 32/40 (80.0%) | 6 | 1 | 1 | 0 | 11.81 | 9.99 | 11.23 | 9.77 |
| major depressive disorder | 36 | 31/36 (86.1%) | 5 | 0 | 0 | 0 | 11.51 | 10.60 | 12.40 | 11.62 |
| TOTAL | 195 | 148/195 (75.9%) | 42 | 3 | 2 | 0 | 12.47 | 10.39 | 12.58 | 11.01 |

No clinician review or human comprehension test was performed. A lower grade does not prove the question is medically equivalent; the original text stays next to every question in the app.
