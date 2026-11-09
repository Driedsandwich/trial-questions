/** Optional evaluation of the LLM rewriting path on a live sample.
 * Reads the endpoint, model and key from environment variables only (never written anywhere).
 * Usage: LLM_ENDPOINT=... LLM_MODEL=... LLM_API_KEY=... npx tsx eval/llm-run.ts [itemsPerSection] [delayMs]
 * Stores only aggregate counts in eval/LLM_RESULTS.md; no criteria or rewritten text are saved. */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { searchTrials, type Trial } from '../src/ctgov.js';
import { buildChecklist } from '../src/checklist.js';
import { rewriteCriterion } from '../src/plain.js';
import { fleschKincaid } from './readability.js';

const endpoint = process.env.LLM_ENDPOINT ?? '', model = process.env.LLM_MODEL ?? '', apiKey = process.env.LLM_API_KEY ?? '';
if (!endpoint || !model || !apiKey) { console.error('Set LLM_ENDPOINT, LLM_MODEL and LLM_API_KEY'); process.exit(2); }
const perSection = Number(process.argv[2] ?? 2), delayMs = Number(process.argv[3] ?? 5000), limitTrials = Number(process.argv[4] ?? 10);
const conditions = ['breast cancer', 'type 2 diabetes', 'asthma', 'rheumatoid arthritis', 'major depressive disorder'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const started = new Date().toISOString();
type Tally = { items: number; accepted: number; numbers: number; forbidden: number; shape: number; error: number; fkOrig: number[]; fkQ: number[]; fkOrigAll: number[]; fkDisplay: number[] };
const blank = (): Tally => ({ items: 0, accepted: 0, numbers: 0, forbidden: 0, shape: 0, error: 0, fkOrig: [], fkQ: [], fkOrigAll: [], fkDisplay: [] });
const byCond = new Map<string, Tally>();
const seen = new Set<string>();
let trialsUsed = 0;
for (const condition of conditions) {
  const t = blank(); byCond.set(condition, t);
  const trials: Trial[] = [];
  let pageToken: string | undefined; let page = 0;
  do {
    const result = await searchTrials({ condition, status: ['RECRUITING'], pageSize: 10, pageToken });
    for (const trial of result.trials) { if (seen.has(trial.nctId)) continue; seen.add(trial.nctId); trials.push(trial); if (trials.length === limitTrials) break; }
    pageToken = result.nextPageToken; page++;
  } while (trials.length < limitTrials && pageToken && page < 10);
  for (const trial of trials) {
    trialsUsed++;
    const checklist = await buildChecklist(trial);
    const pick = [...checklist.items.filter(i => i.section === 'inclusion').slice(0, perSection), ...checklist.items.filter(i => i.section === 'exclusion').slice(0, perSection)];
    for (const item of pick) {
      const r = await rewriteCriterion(item.rewriteSource, { section: item.section, llm: { endpoint, model, apiKey } });
      t.items++;
      const o = fleschKincaid(item.rewriteSource), d = fleschKincaid(r.displayText);
      if (o !== null) t.fkOrigAll.push(o); if (d !== null) t.fkDisplay.push(d);
      if (r.outcome === 'question' && r.question) { t.accepted++; const q = fleschKincaid(r.question); if (o !== null && q !== null) { t.fkOrig.push(o); t.fkQ.push(q); } }
      else if (r.fallbackReason === 'numbers') t.numbers++; else if (r.fallbackReason === 'forbidden_claim') t.forbidden++; else if (r.fallbackReason === 'question_shape') t.shape++; else t.error++;
      await sleep(delayMs);
    }
  }
}
const mean = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 'n/a';
const pct = (n: number, d: number) => d ? `${n}/${d} (${(100 * n / d).toFixed(1)}%)` : '0/0';
const total = blank();
for (const t of byCond.values()) for (const k of Object.keys(total) as (keyof Tally)[]) { const v = t[k]; if (Array.isArray(v)) (total[k] as number[]).push(...v); else (total[k] as number) += v as number; }
const line = (name: string, t: Tally) => `| ${name} | ${t.items} | ${pct(t.accepted, t.items)} | ${t.numbers} | ${t.forbidden} | ${t.shape} | ${t.error} | ${mean(t.fkOrig)} | ${mean(t.fkQ)} | ${mean(t.fkOrigAll)} | ${mean(t.fkDisplay)} |`;
const report = `# LLM rewriting path: live sample\n\nData from ClinicalTrials.gov. Started: ${started}. Finished: ${new Date().toISOString()}. Model: ${model} (OpenAI-compatible chat completions endpoint on ${new URL(endpoint).host}).\n\n## Method\n\nSame live sampling as eval/run.ts (recruiting trials, up to ${limitTrials} per condition, API relevance order; ${trialsUsed} trials used). From each trial, the first ${perSection} inclusion and first ${perSection} exclusion items were rewritten through the optional LLM path in src/plain.ts, with the same gates as the app: every number, unit and comparison token must be preserved in order, eligibility claims are blocked, and the output must be exactly one question. Any rejected rewrite displays the original text instead. No criteria or rewritten text are stored here; only counts. Readability is the Flesch–Kincaid grade from eval/readability.ts (a rough heuristic, not proof of understanding).\n\n| Condition | Items | Accepted questions | Rejected: numbers | Rejected: claim | Rejected: shape | Errors | Original FK (accepted) | Question FK (accepted) | Original FK (all) | Displayed FK (all) |\n| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${[...byCond].map(([c, t]) => line(c, t)).join('\n')}\n${line('TOTAL', total)}\n\nNo clinician review or human comprehension test was performed. A lower grade does not prove the question is medically equivalent; the original text stays next to every question in the app.\n`;
await writeFile(join(fileURLToPath(new URL('.', import.meta.url)), 'LLM_RESULTS.md'), report);
console.log(`Wrote eval/LLM_RESULTS.md: ${total.items} items, accepted ${total.accepted}`);
