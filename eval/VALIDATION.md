# Validation

Checked at 2026-11-09T00:31:10.920Z.

| Check | Observed result |
| --- | --- |
| npm run build | Passed (TypeScript strict) |
| npm test | 65 tests passed in 2 files |
| Glossary availability | 60 entries; 0 failed source checks |
| Live evaluation | 50 recruiting trials; 856 parsed items |
| Live MCP stdio search_trials | Passed; returned a recruiting asthma trial |
| Live MCP stdio get_trial_checklist | Passed for NCT01143480; 19 items and 4 structured rows |
| Free-text status in live MCP result | All ask_doctor |
| Returned API response date | Mon, 09 Nov 2026 00:31:10 GMT |
| Returned processing date | 2026-11-09T00:31:10.919Z |
| npm pack --dry-run | No trial record snapshots or temporary evaluation files included |

Runtime: Node v26.13.0. Unit tests use synthetic fixtures. The live smoke test sends only a public NCT ID and synthetic age/sex to the local MCP subprocess; no patient data or LLM key was used. Only derived counts and provenance are recorded here.

Not validated: real paid LLM requests, clinician-rated meaning preservation, patient comprehension, or physical print pagination. Long checklists flow to multiple pages.
