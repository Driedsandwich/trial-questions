import { getTrial, type Trial, type Provenance } from './ctgov.js';
import { ancestors, splitCriteria, type Criterion, type Heading } from './split.js';
import { checkStructured, type CheckStatus, type StructuredCheck, type UserProfile } from './structured.js';
import { rewriteCriterion, type LlmOptions, type PlainResult } from './plain.js';
export const DISCLAIMER = 'This tool does not decide whether you can join a trial. Bring these questions to your doctor.';
export const MODIFICATION_NOTICE = 'Questions are rewritten from the original criteria; the original text is shown next to each question.';
export interface ChecklistItem extends Criterion {
  context: { original: string; start: number; end: number; id: string }[];
  /** Context and item combined, exactly the source submitted to the number check. */
  rewriteSource: string; rewrite: PlainResult; status: CheckStatus;
}
export interface Checklist {
  nctId: string; title: string; overallStatus: string; source: Provenance;
  disclaimer: string; modificationNotice: string; items: ChecklistItem[];
  structured: StructuredCheck[]; headings: Heading[]; warnings: string[];
}
export async function buildChecklist(trial: Trial, profile: UserProfile = {}, llm?: LlmOptions): Promise<Checklist> {
  const split = splitCriteria(trial.eligibility.eligibilityCriteria ?? '');
  const items: ChecklistItem[] = [];
  for (const item of split.items) {
    const context = ancestors(item, split.items).map(({ original, start, end, id }) => ({ original, start, end, id }));
    const rewriteSource = [...context.map(c => c.original), item.original].join('\n');
    items.push({ ...item, context, rewriteSource, rewrite: await rewriteCriterion(rewriteSource, { section: item.section, llm }), status: 'ask_doctor' });
  }
  return { nctId: trial.nctId, title: trial.title, overallStatus: trial.overallStatus,
    source: { ...trial.source, processedAt: new Date().toISOString() }, disclaimer: DISCLAIMER, modificationNotice: MODIFICATION_NOTICE,
    items, structured: checkStructured(trial.eligibility, profile), headings: split.headings, warnings: split.warnings };
}
export async function getTrialChecklist(nctId: string, profile: UserProfile = {}): Promise<Checklist> {
  return buildChecklist(await getTrial(nctId), profile);
}
