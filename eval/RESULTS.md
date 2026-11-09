# Live evaluation results

Data from ClinicalTrials.gov. Started: 2026-11-09T01:11:36.072Z. Finished: 2026-11-09T01:11:41.597Z.

## Method

Fetched live API v2 records with query.cond set to each condition below, filter.overallStatus=RECRUITING, pageSize=10, and explicit fields. Default API relevance order; the first 10 distinct records per condition were used, with pagination when needed. 0 duplicate records were skipped across conditions. These are a convenience sample, not a representative or clinically validated sample. Full records existed only in eval/.tmp during this run and were deleted in finally. No criteria or rewritten trial text are stored in this report. No LLM calls.

Structured comparisons used the synthetic input age=45 years, sex=FEMALE. The structured denominator is four rows per record (minimumAge, maximumAge, sex, healthyVolunteers), including missing/unsupported values. The total denominator adds all free-text items. A matched or not_matched field counts as compared; neither is a trial participation verdict.

Number failures refer to proposed rule questions before fallback. Every rejected question displays the original instead. Number checking compares ordered lexical tokens, units and operators; it does not prove meaning. All fallback counts include the claim and question-shape gates.

## Splitting, automation and number preservation

| Condition | Trials | Items | Nested items | Headings | Trials without headings | Compared / structured | Compared / all items | Numeric failures / items | All fallbacks |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: |
| breast cancer | 10 | 204 | 36 | 20 | 0 | 25/40 (62.50%) | 25/244 (10.25%) | 19/204 (9.31%) | 34 |
| type 2 diabetes | 10 | 158 | 59 | 20 | 0 | 24/40 (60.00%) | 24/198 (12.12%) | 4/158 (2.53%) | 9 |
| asthma | 10 | 136 | 20 | 20 | 0 | 26/40 (65.00%) | 26/176 (14.77%) | 2/136 (1.47%) | 6 |
| rheumatoid arthritis | 10 | 229 | 66 | 20 | 0 | 25/40 (62.50%) | 25/269 (9.29%) | 8/229 (3.49%) | 20 |
| major depressive disorder | 10 | 129 | 22 | 25 | 0 | 27/40 (67.50%) | 27/169 (15.98%) | 0/129 (0.00%) | 1 |
| TOTAL | 50 | 856 | 203 | 105 | 0 | 127/200 (63.50%) | 127/1056 (12.03%) | 33/856 (3.86%) | 70 |

Section item counts: inclusion=369; exclusion=487; unspecified=0. Exact slice/offset mismatches=0. These counts measure parser behavior, not accuracy against a human gold standard. Parent context is retained in generated questions; no-heading paragraphs remain unspecified.

## Observed heading spellings

| Recognized heading (case and markup retained) | Occurrences |
| --- | ---: |
| Inclusion Criteria: | 48 |
| Exclusion Criteria: | 47 |
| INCLUSION CRITERIA: | 2 |
| EXCLUSION CRITERIA: | 2 |
| Inclusion Criteria | 2 |
| Exclusion Criteria | 1 |
| General Inclusion Criteria: | 1 |
| General Exclusion Criteria: | 1 |
| Additional Exclusion Criteria: | 1 |

## Flesch–Kincaid grade

Formula: 0.39 × words/sentences + 11.8 × syllables/words − 15.59. Syllables are computed by the vowel-group heuristic in readability.ts, not a pronunciation dictionary. Entries without alphabetic words are excluded. Values are arithmetic means of item-level grades, without clamping. For nested items, the original includes the same ancestor context submitted for rewriting. Accepted-question columns compare the same paired items; display columns include fallbacks. A lower computed grade is not proof of understanding or medical safety.

| Condition | Accepted question pairs | Original FK | Question FK | All display pairs | Original FK (all) | Display FK (all) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| breast cancer | 170 | 14.57 | 14.17 | 204 | 15.18 | 14.85 |
| type 2 diabetes | 149 | 12.63 | 12.71 | 158 | 12.73 | 12.81 |
| asthma | 130 | 15.24 | 14.68 | 136 | 15.15 | 14.62 |
| rheumatoid arthritis | 209 | 14.66 | 14.29 | 229 | 15.09 | 14.76 |
| major depressive disorder | 128 | 14.10 | 13.53 | 129 | 14.08 | 13.51 |
| TOTAL | 786 | 14.26 | 13.91 | 856 | 14.53 | 14.21 |

## Record identifiers and derived counts

IDs identify the fetched sample; later API data may change. These are derived measurements, not saved study records.

| Condition | NCT ID | Items | Recognized headings | Nested | Compared fields | Numeric failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| breast cancer | NCT04646759 | 28 | 2 | 16 | 3 | 3 |
| breast cancer | NCT07263425 | 17 | 2 | 15 | 3 | 2 |
| breast cancer | NCT06984250 | 8 | 2 | 0 | 3 | 0 |
| breast cancer | NCT06839560 | 32 | 2 | 5 | 2 | 0 |
| breast cancer | NCT07309770 | 48 | 2 | 0 | 2 | 4 |
| breast cancer | NCT06281210 | 13 | 2 | 0 | 2 | 0 |
| breast cancer | NCT06907810 | 9 | 2 | 0 | 2 | 0 |
| breast cancer | NCT07570524 | 11 | 2 | 0 | 2 | 1 |
| breast cancer | NCT07372079 | 22 | 2 | 0 | 3 | 6 |
| breast cancer | NCT07244094 | 16 | 2 | 0 | 3 | 3 |
| type 2 diabetes | NCT07847294 | 7 | 2 | 0 | 3 | 0 |
| type 2 diabetes | NCT03455868 | 3 | 2 | 0 | 3 | 0 |
| type 2 diabetes | NCT07149610 | 17 | 2 | 0 | 2 | 0 |
| type 2 diabetes | NCT07773779 | 10 | 2 | 0 | 3 | 0 |
| type 2 diabetes | NCT05933161 | 9 | 2 | 0 | 2 | 0 |
| type 2 diabetes | NCT05970237 | 7 | 2 | 0 | 2 | 0 |
| type 2 diabetes | NCT07866066 | 12 | 2 | 2 | 2 | 1 |
| type 2 diabetes | NCT07554469 | 10 | 2 | 0 | 2 | 0 |
| type 2 diabetes | NCT02973412 | 16 | 2 | 0 | 3 | 0 |
| type 2 diabetes | NCT06647745 | 67 | 2 | 57 | 2 | 3 |
| asthma | NCT01143480 | 19 | 2 | 0 | 3 | 0 |
| asthma | NCT05364957 | 18 | 2 | 1 | 3 | 0 |
| asthma | NCT06273072 | 15 | 2 | 0 | 2 | 2 |
| asthma | NCT07324707 | 27 | 2 | 0 | 3 | 0 |
| asthma | NCT05819944 | 17 | 2 | 8 | 2 | 0 |
| asthma | NCT07455396 | 6 | 2 | 0 | 3 | 0 |
| asthma | NCT04639791 | 5 | 2 | 0 | 2 | 0 |
| asthma | NCT07823842 | 15 | 2 | 9 | 2 | 0 |
| asthma | NCT07055542 | 9 | 2 | 2 | 3 | 0 |
| asthma | NCT04578171 | 5 | 2 | 0 | 3 | 0 |
| rheumatoid arthritis | NCT07160231 | 9 | 2 | 0 | 2 | 0 |
| rheumatoid arthritis | NCT05926622 | 7 | 2 | 0 | 2 | 0 |
| rheumatoid arthritis | NCT04876781 | 18 | 2 | 16 | 2 | 2 |
| rheumatoid arthritis | NCT03414502 | 21 | 2 | 7 | 2 | 1 |
| rheumatoid arthritis | NCT07774507 | 12 | 2 | 0 | 3 | 0 |
| rheumatoid arthritis | NCT06733935 | 65 | 2 | 32 | 3 | 4 |
| rheumatoid arthritis | NCT07409103 | 47 | 2 | 11 | 3 | 0 |
| rheumatoid arthritis | NCT05428488 | 33 | 2 | 0 | 2 | 1 |
| rheumatoid arthritis | NCT07171983 | 8 | 2 | 0 | 3 | 0 |
| rheumatoid arthritis | NCT05264025 | 9 | 2 | 0 | 3 | 0 |
| major depressive disorder | NCT06667180 | 10 | 2 | 0 | 3 | 0 |
| major depressive disorder | NCT06493825 | 7 | 2 | 0 | 3 | 0 |
| major depressive disorder | NCT06005103 | 13 | 2 | 0 | 3 | 0 |
| major depressive disorder | NCT07065240 | 20 | 2 | 6 | 3 | 0 |
| major depressive disorder | NCT07377682 | 13 | 2 | 0 | 2 | 0 |
| major depressive disorder | NCT04788524 | 29 | 7 | 0 | 3 | 0 |
| major depressive disorder | NCT07026461 | 6 | 2 | 0 | 2 | 0 |
| major depressive disorder | NCT07576686 | 2 | 2 | 0 | 2 | 0 |
| major depressive disorder | NCT07221929 | 11 | 2 | 0 | 3 | 0 |
| major depressive disorder | NCT07645157 | 18 | 2 | 16 | 3 | 0 |

## Failures and limits

No API/processing errors occurred in this run.

No patient data, clinician review, human-rated simplification accuracy, LLM quality evaluation or physical print pagination was measured. Synthetic parser/guard/transport tests are separate from these live measurements.
