import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchTrials, type Trial } from '../src/ctgov.js';
import { buildChecklist } from '../src/checklist.js';
import { fleschKincaid } from './readability.js';
const conditions = ['breast cancer', 'type 2 diabetes', 'asthma', 'rheumatoid arthritis', 'major depressive disorder'];
const dir = fileURLToPath(new URL('.', import.meta.url));
await mkdir(join(dir, '.tmp'), { recursive: true });
const temp = await mkdtemp(join(dir, '.tmp', 'run-'));
const started = new Date().toISOString();
const profile = { age: 45, sex: 'FEMALE' as const }; // Synthetic; not patient information.
type Row = { condition: string; id: string; items: number; nested: number; headings: number; noHeading: number; inclusion: number; exclusion: number; unspecified: number; checked: number; structured: number; numericFail: number; fallback: number; questions: number; offsetErrors: number; originalGrades: number[]; questionGrades: number[]; allOriginalGrades: number[]; displayGrades: number[] };
const rows: Row[] = [];
const headingCounts = new Map<string, number>();
const errors: string[] = [];
const seen = new Set<string>();
let duplicates = 0;
try {
  for (const condition of conditions) {
    let pageToken: string | undefined;
    const trials: Trial[] = [];
    let page = 0;
    try {
      do {
        const result = await searchTrials({ condition, status: ['RECRUITING'], pageSize: 10, pageToken });
        await writeFile(join(temp, `${conditions.indexOf(condition)}-${page++}.json`), JSON.stringify(result));
        for (const trial of result.trials) {
          if (trial.overallStatus !== 'RECRUITING') throw new Error('API returned a non-recruiting trial');
          if (seen.has(trial.nctId)) { duplicates++; continue; }
          seen.add(trial.nctId); trials.push(trial);
          if (trials.length === 10) break;
        }
        pageToken = result.nextPageToken;
      } while (trials.length < 10 && pageToken && page < 10);
    } catch (error) { errors.push(`${condition}: ${String(error)}`); }
    for (const trial of trials) {
      const checklist = await buildChecklist(trial, profile);
      const text = trial.eligibility.eligibilityCriteria ?? '';
      for (const h of checklist.headings) headingCounts.set(h.text, (headingCounts.get(h.text) ?? 0) + 1);
      const row: Row = { condition, id: trial.nctId, items: checklist.items.length, nested: checklist.items.filter(i => i.depth > 0).length, headings: checklist.headings.length, noHeading: Number(checklist.headings.length === 0), inclusion: checklist.items.filter(i => i.section === 'inclusion').length, exclusion: checklist.items.filter(i => i.section === 'exclusion').length, unspecified: checklist.items.filter(i => i.section === 'unspecified').length, checked: checklist.structured.filter(i => i.status !== 'ask_doctor').length, structured: checklist.structured.length, numericFail: checklist.items.filter(i => !i.rewrite.numberCheck.passed).length, fallback: checklist.items.filter(i => i.rewrite.outcome === 'original').length, questions: 0, offsetErrors: 0, originalGrades: [], questionGrades: [], allOriginalGrades: [], displayGrades: [] };
      for (const item of checklist.items) {
        if (text.slice(item.start, item.end) !== item.original) row.offsetErrors++;
        const original = fleschKincaid(item.rewriteSource);
        const display = fleschKincaid(item.rewrite.displayText);
        if (original !== null && display !== null) { row.allOriginalGrades.push(original); row.displayGrades.push(display); }
        if (item.rewrite.question) {
          const grade = fleschKincaid(item.rewrite.question);
          if (original !== null && grade !== null) { row.originalGrades.push(original); row.questionGrades.push(grade); row.questions++; }
        }
      }
      rows.push(row);
    }
    console.log(`${condition}: ${trials.length} live recruiting records measured`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
  // The script is single-run; remove the empty parent too when possible.
  await rm(join(dir, '.tmp'), { recursive: true, force: true });
}
const pct = (n: number, d: number) => d ? `${n}/${d} (${(100 * n / d).toFixed(2)}%)` : 'N/A (no observations)';
const mean = (ns: number[]) => ns.length ? (ns.reduce((s, n) => s + n, 0) / ns.length).toFixed(2) : 'N/A';
const sum = (rs: Row[], key: keyof Row) => rs.reduce((s, r) => s + (typeof r[key] === 'number' ? r[key] as number : 0), 0);
const aggregate = (label: string, rs: Row[]) => `| ${label} | ${rs.length} | ${sum(rs, 'items')} | ${sum(rs, 'nested')} | ${sum(rs, 'headings')} | ${sum(rs, 'noHeading')} | ${pct(sum(rs, 'checked'), sum(rs, 'structured'))} | ${pct(sum(rs, 'checked'), sum(rs, 'items') + sum(rs, 'structured'))} | ${pct(sum(rs, 'numericFail'), sum(rs, 'items'))} | ${sum(rs, 'fallback')} |`;
const readability = (label: string, rs: Row[]) => `| ${label} | ${sum(rs, 'questions')} | ${mean(rs.flatMap(r => r.originalGrades))} | ${mean(rs.flatMap(r => r.questionGrades))} | ${rs.flatMap(r => r.allOriginalGrades).length} | ${mean(rs.flatMap(r => r.allOriginalGrades))} | ${mean(rs.flatMap(r => r.displayGrades))} |`;
const report = `# Live evaluation results\n\nData from ClinicalTrials.gov. Started: ${started}. Finished: ${new Date().toISOString()}.\n\n## Method\n\nFetched live API v2 records with query.cond set to each condition below, filter.overallStatus=RECRUITING, pageSize=10, and explicit fields. Default API relevance order; the first 10 distinct records per condition were used, with pagination when needed. ${duplicates} duplicate records were skipped across conditions. These are a convenience sample, not a representative or clinically validated sample. Full records existed only in eval/.tmp during this run and were deleted in finally. No criteria or rewritten trial text are stored in this report. No LLM calls.\n\nStructured comparisons used the synthetic input age=45 years, sex=FEMALE. The structured denominator is four rows per record (minimumAge, maximumAge, sex, healthyVolunteers), including missing/unsupported values. The total denominator adds all free-text items. A matched or not_matched field counts as compared; neither is a trial participation verdict.\n\nNumber failures refer to proposed rule questions before fallback. Every rejected question displays the original instead. Number checking compares ordered lexical tokens, units and operators; it does not prove meaning. All fallback counts include the claim and question-shape gates.\n\n## Splitting, automation and number preservation\n\n| Condition | Trials | Items | Nested items | Headings | Trials without headings | Compared / structured | Compared / all items | Numeric failures / items | All fallbacks |\n| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: |\n${conditions.map(c => aggregate(c, rows.filter(r => r.condition === c))).join('\n')}\n${aggregate('TOTAL', rows)}\n\nSection item counts: inclusion=${sum(rows, 'inclusion')}; exclusion=${sum(rows, 'exclusion')}; unspecified=${sum(rows, 'unspecified')}. Exact slice/offset mismatches=${sum(rows, 'offsetErrors')}. These counts measure parser behavior, not accuracy against a human gold standard. Parent context is retained in generated questions; no-heading paragraphs remain unspecified.\n\n## Observed heading spellings\n\n| Recognized heading (case and markup retained) | Occurrences |\n| --- | ---: |\n${[...headingCounts].sort((a,b) => b[1]-a[1]).map(([h,n]) => `| ${h.replace(/\|/g, '\\|').replace(/\*/g, '\\*')} | ${n} |`).join('\n')}\n\n## Flesch–Kincaid grade\n\nFormula: 0.39 × words/sentences + 11.8 × syllables/words − 15.59. Syllables are computed by the vowel-group heuristic in readability.ts, not a pronunciation dictionary. Entries without alphabetic words are excluded. Values are arithmetic means of item-level grades, without clamping. For nested items, the original includes the same ancestor context submitted for rewriting. Accepted-question columns compare the same paired items; display columns include fallbacks. A lower computed grade is not proof of understanding or medical safety.\n\n| Condition | Accepted question pairs | Original FK | Question FK | All display pairs | Original FK (all) | Display FK (all) |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${conditions.map(c => readability(c, rows.filter(r => r.condition === c))).join('\n')}\n${readability('TOTAL', rows)}\n\n## Record identifiers and derived counts\n\nIDs identify the fetched sample; later API data may change. These are derived measurements, not saved study records.\n\n| Condition | NCT ID | Items | Recognized headings | Nested | Compared fields | Numeric failures |\n| --- | --- | ---: | ---: | ---: | ---: | ---: |\n${rows.map(r => `| ${r.condition} | ${r.id} | ${r.items} | ${r.headings} | ${r.nested} | ${r.checked} | ${r.numericFail} |`).join('\n')}\n\n## Failures and limits\n\n${errors.length ? errors.join('\n\n') : 'No API/processing errors occurred in this run.'}\n\nNo patient data, clinician review, human-rated simplification accuracy, LLM quality evaluation or physical print pagination was measured. Synthetic parser/guard/transport tests are separate from these live measurements.\n`;
await writeFile(join(dir, 'RESULTS.md'), report);
console.log(`Wrote eval/RESULTS.md: ${rows.length} trials, ${sum(rows, 'items')} items; temporary records removed.`);
if (errors.length || rows.length !== 50) process.exitCode = 1;
