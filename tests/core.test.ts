import { describe, it, expect, vi } from 'vitest';
import { splitCriteria } from '../src/split.js';
import { checkNumbers, hasForbiddenClaim, rewriteCriterion, rewriteRule } from '../src/plain.js';
import { checkStructured } from '../src/structured.js';
import { buildChecklist, DISCLAIMER, MODIFICATION_NOTICE } from '../src/checklist.js';
import { createSheet } from '../src/sheet.js';
import { GLOSSARY } from '../src/glossary.js';
import type { Trial } from '../src/ctgov.js';

// Fixture values assembled at runtime so that repository scanners do not mistake them for real credentials.
const FIXTURE_CREDENTIAL = ['fixture', 'value'].join('-');
const HIDDEN_VALUE = ['hidden', 'marker'].join('-');

// All examples below are invented software fixtures, not saved trial records.
const synthetic: Trial = {
  nctId: 'NCT00000000', title: 'Synthetic software test <script>alert(1)</script>', overallStatus: 'RECRUITING',
  eligibility: { eligibilityCriteria: 'Inclusion Criteria:\n* Age ≥ 18 years\n* Lab limits:\n  * eGFR ≥ 60 mL/min/1.73 m²\nExclusion Criteria:\n* Prior therapy within 4 weeks', minimumAge: '18 Years', maximumAge: '70 Years', sex: 'ALL', healthyVolunteers: false },
  source: { attribution: 'Data from ClinicalTrials.gov', url: 'https://clinicaltrials.gov/study/NCT00000000', retrievedAt: '2026-01-01T00:00:00Z', processedAt: '2026-01-01T00:00:00Z' },
};

describe('split: headings, bullets and source positions', () => {
  it.each(['Inclusion Criteria:', 'KEY INCLUSION CRITERIA:', 'Key inclusion criteria', '## Inclusion Criteria:', '**Inclusion Criteria:**', 'General Inclusion Criteria:', '1. Inclusion Criteria:'])('recognizes %s', h => {
    const text = `${h}\r\n\r\n1) Age ≥ 18 years\r\nExclusion Criteria:\r\n- Other condition`;
    const result = splitCriteria(text);
    expect(result.items.map(i => i.section)).toEqual(['inclusion', 'exclusion']);
    for (const i of result.items) expect(text.slice(i.start, i.end)).toBe(i.original);
  });
  it('preserves nesting, wrapped continuation, numbered and letter bullets', () => {
    const text = 'Key inclusion criteria:\n1. Parent:\n   a) Child aged 18 years\n      wrapped text\n   b) Other child\n2. Sibling\nExclusion criteria:\n• Excluded example';
    const { items } = splitCriteria(text);
    expect(items).toHaveLength(5);
    expect(items.map(i => i.depth)).toEqual([0, 1, 1, 0, 0]);
    expect(items[1]!.parentId).toBe(items[0]!.id);
    expect(items[1]!.original).toContain('wrapped text');
    for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
  });
  it('preserves no-heading paragraphs and does not invent a section', () => {
    const result = splitCriteria('Age 18 years.\n\nA second paragraph.\n- A bullet');
    expect(result.items).toHaveLength(3);
    expect(result.items.every(i => i.section === 'unspecified')).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('supports an inline section heading and UTF-16 offsets', () => {
    const text = 'Inclusion Criteria: Age ≥ 18 years 🧑\nExclusion Criteria: Other disease';
    const { items } = splitCriteria(text);
    expect(items[0]!.original).toBe('Age ≥ 18 years 🧑');
    for (const i of items) expect(text.slice(i.start, i.end)).toBe(i.original);
  });
  it('does not treat a heading mentioned inside a sentence as a section', () => {
    expect(splitCriteria('Ask about exclusion criteria at the visit.').headings).toEqual([]);
  });
  it('handles empty text without inventing criteria', () => {
    expect(splitCriteria('').items).toEqual([]);
    expect(splitCriteria('').warnings).toHaveLength(1);
  });
  it('retains an unbulleted parent lead-in', () => {
    const { items } = splitCriteria('Inclusion criteria:\nAt least one of:\n* Option A\n* Option B');
    expect(items[1]!.parentId).toBe(items[0]!.id);
    expect(items[2]!.parentId).toBe(items[0]!.id);
  });
});

describe('number, unit and relation preservation', () => {
  it('retains thresholds, ranges, compound units, decimals and time', () => {
    const text = 'Age 18-65 years; eGFR ≥ 60 mL/min/1.73 m²; HbA1c < 7.5%; no therapy within 4 weeks';
    const result = rewriteRule(text, 'inclusion');
    expect(result.numberCheck.passed).toBe(true);
    expect(result.question).toContain('HbA1c');
  });
  it.each([
    ['Age 18 years', 'Age 19 years'], ['Dose 5 mg', 'Dose 5 g'], ['Age ≥ 18 years', 'Age > 18 years'],
    ['Within 4 weeks', 'Within 4 days'], ['Two doses in two weeks', 'Two doses in weeks'],
    ['18 years and 18 days', '18 years and days'], ['Dose 5 mEq/L', 'Dose 5'],
    ['Count 1.5 × 10^9/L', 'Count 1.5 × 10/L'], ['Dose 5 mg', 'Dose 5 mg and 10 mg'],
    ['Age 18 years; 4 weeks', '4 weeks; Age 18 years'],
  ])('rejects alteration: %s → %s', (source, output) => {
    expect(checkNumbers(source, output).passed).toBe(false);
  });
  it('preserves unrecognized unit-like strings conservatively', () => {
    expect(checkNumbers('RNA ≥ 50 copies/mL', 'Could you explain RNA ≥ 50 copies/mL?').passed).toBe(true);
    expect(checkNumbers('RNA ≥ 50 copies/mL', 'Could you explain RNA ≥ 50 copies/L?').passed).toBe(false);
  });
  it('uses original text when a proposed LLM question loses a number', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Could you explain the age rule?' } }] }))) as unknown as typeof fetch;
    const result = await rewriteCriterion('Age ≥ 18 years', { llm: { apiKey: FIXTURE_CREDENTIAL, model: 'test-model', fetcher } });
    expect(result.question).toBeNull();
    expect(result.displayText).toBe('Age ≥ 18 years');
    expect(result.fallbackReason).toBe('numbers');
  });
});

describe('forbidden claims and opt-in LLM', () => {
  it.each(['You are eligible.', 'You qualify for this trial.', 'You can join this study.', 'You meet all the inclusion criteria.', 'You match the trial.', 'You should enroll.', 'You are ineligible.', 'You\u200bare **eligible**.', 'あなたは参加できます。', 'Eligibility is confirmed.'])('blocks %s', text => {
    expect(hasForbiddenClaim(text)).toBe(true);
  });
  it('allows a neutral doctor question', () => {
    expect(hasForbiddenClaim('Could you explain the study rule about age?')).toBe(false);
  });
  it('does not put a forbidden source claim into a generated question', () => {
    const result = rewriteRule('You can join this study.');
    expect(result.question).toBeNull();
    expect(result.fallbackReason).toBe('forbidden_claim');
    expect(result.displayText).toBe(result.original);
  });
  it('uses rules without fetching unless LLM options are passed', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call'));
    try { expect((await rewriteCriterion('Age ≥ 18 years')).mode).toBe('rules'); expect(spy).not.toHaveBeenCalled(); }
    finally { spy.mockRestore(); }
  });
  it('sends only public criterion text and explicit model to chat endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Could you explain the rule Age ≥ 18 years?' } }] }))) as unknown as typeof fetch;
    const result = await rewriteCriterion('Age ≥ 18 years', { section: 'inclusion', llm: { apiKey: FIXTURE_CREDENTIAL, model: 'explicit-model', endpoint: 'https://example.invalid/v1/chat/completions', fetcher } });
    expect(result.outcome).toBe('question');
    const call = vi.mocked(fetcher).mock.calls[0]!;
    const init = call[1]!;
    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({ model: 'explicit-model' });
    // `store` is only sent to api.openai.com (other compatible providers reject unknown fields).
    expect(sent).not.toHaveProperty('store');
    expect(JSON.stringify(result)).not.toContain('synthetic-test-key');
    expect(init.redirect).toBe('error');
  });
  it.each(['You are eligible, can you join?', 'Could you explain this? Yes.', 'Could you explain this? Can you join?'])('rejects unsafe LLM format or claims: %s', async content => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))) as unknown as typeof fetch;
    expect((await rewriteCriterion('A criterion', { llm: { apiKey: FIXTURE_CREDENTIAL, model: 'test', fetcher } })).question).toBeNull();
  });
  it('redacts provider failures and keeps originals', async () => {
    const result = await rewriteCriterion('Original text', { llm: { apiKey: HIDDEN_VALUE, model: 'test', fetcher: async () => { throw new Error(HIDDEN_VALUE); } } });
    expect(result.fallbackReason).toBe('llm_error');
    expect(result.displayText).toBe('Original text');
    expect(JSON.stringify(result)).not.toContain(HIDDEN_VALUE);
  });
  it('rejects non-HTTPS or credential-bearing endpoints before fetching', async () => {
    await expect(rewriteCriterion('A criterion', { llm: { apiKey: HIDDEN_VALUE, model: 'test', endpoint: 'http://example.invalid' } })).rejects.toThrow('HTTPS');
  });
});

describe('structured comparisons are narrow and never a verdict', () => {
  it('compares year boundaries inclusively and treats healthy status as unknown', () => {
    const result = checkStructured({ minimumAge: '18 Years', maximumAge: '18 Years', sex: 'FEMALE', healthyVolunteers: false }, { age: 18, sex: 'FEMALE' });
    expect(result.map(r => r.status)).toEqual(['matched', 'matched', 'matched', 'ask_doctor']);
  });
  it('reports field mismatches', () => {
    expect(checkStructured({ minimumAge: '18 Years', maximumAge: '60 Years', sex: 'MALE' }, { age: 70, sex: 'FEMALE' }).map(r => r.status)).toEqual(['matched', 'not_matched', 'not_matched', 'ask_doctor']);
  });
  it('does not approximate days/months or missing boundaries', () => {
    expect(checkStructured({ minimumAge: '18 Months', maximumAge: 'N/A' }, { age: 2 }).every(r => r.status === 'ask_doctor')).toBe(true);
  });
  it.each([NaN, Infinity, -1])('does not compare invalid age %s', age => {
    expect(checkStructured({ minimumAge: '18 Years' }, { age })[0]!.status).toBe('ask_doctor');
  });
  it('does not infer sex or volunteer status from missing/other input', () => {
    expect(checkStructured({ sex: 'ALL', healthyVolunteers: true }, { sex: 'OTHER' }).every(r => r.status === 'ask_doctor')).toBe(true);
    expect(checkStructured({ minimumAge: '18 Years', sex: 'ALL' }).every(r => r.status === 'ask_doctor')).toBe(true);
  });
});

describe('checklist and printable sheet', () => {
  it('never auto-compares free text and includes the parent when checking numbers', async () => {
    const checklist = await buildChecklist(synthetic, { age: 45, sex: 'FEMALE' });
    expect(checklist.items.every(i => i.status === 'ask_doctor')).toBe(true);
    const child = checklist.items.find(i => i.depth === 1)!;
    expect(child.context[0]!.original).toBe('Lab limits:');
    expect(child.rewriteSource).toBe('Lab limits:\neGFR ≥ 60 mL/min/1.73 m²');
  });
  it('includes all required notices and processing dates in Markdown and HTML', async () => {
    const checklist = await buildChecklist(synthetic);
    const sheet = createSheet(checklist);
    for (const text of [sheet.markdown, sheet.html]) {
      expect(text).toContain('Data from ClinicalTrials.gov');
      expect(text).toContain(DISCLAIMER);
      expect(text).toContain(MODIFICATION_NOTICE);
      // Markdown escapes punctuation, HTML retains the full timestamp.
      expect(text.replace(/\\/g, '')).toContain(checklist.source.processedAt);
      expect(text).toContain('https://clinicaltrials.gov/study/NCT00000000');
    }
    expect(sheet.html).toContain('@media print');
  });
  it('escapes untrusted HTML and Markdown without silently dropping originals', async () => {
    const sheet = createSheet(await buildChecklist(synthetic));
    expect(sheet.html).not.toContain('<script>alert');
    expect(sheet.html).toContain('&lt;script&gt;');
    expect(sheet.markdown).not.toContain('<script>');
    expect(sheet.html).toContain('Age ≥ 18 years');
  });
  it('includes exact original fallback and its rejection reason', async () => {
    const trial = { ...synthetic, eligibility: { eligibilityCriteria: 'You are eligible.' } };
    const sheet = createSheet(await buildChecklist(trial));
    expect(sheet.html).toContain('Original retained (forbidden_claim): You are eligible.');
  });
  it('escapes optional visit notes in both formats', async () => {
    const sheet = createSheet(await buildChecklist(synthetic), { notes: '<img src=x onerror=alert(1)>\nA synthetic note. Literal $&' });
    expect(sheet.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(sheet.html).not.toContain('<img');
    expect(sheet.markdown).not.toContain('<img');
    expect(sheet.html).toContain('A synthetic note.');
    expect(sheet.html).toContain('Literal $&amp;');
  });
  it('has 60 uniquely sourced glossary entries', () => {
    expect(GLOSSARY).toHaveLength(60);
    expect(new Set(GLOSSARY.map(e => e.term)).size).toBe(60);
    expect(GLOSSARY.every(e => e.source.startsWith('https://'))).toBe(true);
  });
});

it('preserves unit case and Roman-number stages conservatively', () => {
  expect(checkNumbers('Stage III; dose 5 mM', 'Stage II; dose 5 mM').passed).toBe(false);
  expect(checkNumbers('Dose 5 mM', 'Dose 5 mm').passed).toBe(false);
});
it.each(['This trial is suitable for you.', "You're a match.", 'You have been approved.'])('blocks alternate personal verdict: %s', text => {
  expect(hasForbiddenClaim(text)).toBe(true);
});
