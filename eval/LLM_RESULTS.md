# LLM rewriting path: live sample

Data from ClinicalTrials.gov. Started: 2026-11-09T02:51:28.634Z. Finished: 2026-11-09T02:52:04.197Z. Model: gemini-3.8-flash (OpenAI-compatible chat completions endpoint on generativelanguage.googleapis.com).

## Method

Same live sampling as eval/run.ts (recruiting trials, up to 1 per condition, API relevance order; 5 trials used). From each trial, the first 1 inclusion and first 1 exclusion items were rewritten through the optional LLM path in src/plain.ts, with the same gates as the app: every number, unit and comparison token must be preserved in order, eligibility claims are blocked, and the output must be exactly one question. Any rejected rewrite displays the original text instead. No criteria or rewritten text are stored here; only counts. Readability is the Flesch–Kincaid grade from eval/readability.ts (a rough heuristic, not proof of understanding).

| Condition | Items | Accepted questions | Rejected: numbers | Rejected: claim | Rejected: shape | Errors | Original FK (accepted) | Question FK (accepted) | Original FK (all) | Displayed FK (all) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| breast cancer | 2 | 0/2 (0.0%) | 0 | 0 | 0 | 2 | n/a | n/a | 11.86 | 11.86 |
| type 2 diabetes | 2 | 0/2 (0.0%) | 0 | 0 | 0 | 2 | n/a | n/a | 14.37 | 14.37 |
| asthma | 2 | 0/2 (0.0%) | 0 | 0 | 0 | 2 | n/a | n/a | 8.75 | 8.75 |
| rheumatoid arthritis | 2 | 0/2 (0.0%) | 0 | 0 | 0 | 2 | n/a | n/a | 8.53 | 8.53 |
| major depressive disorder | 2 | 0/2 (0.0%) | 0 | 0 | 0 | 2 | n/a | n/a | 0.72 | 0.72 |
| TOTAL | 10 | 0/10 (0.0%) | 0 | 0 | 0 | 10 | n/a | n/a | 8.85 | 8.85 |

No clinician review or human comprehension test was performed. A lower grade does not prove the question is medically equivalent; the original text stays next to every question in the app.
