import { describe, expect, it } from 'vitest';
import { rewriteRule, stripBoilerplate, hasForbiddenClaim } from '../src/plain.js';

describe('rule-based question templates', () => {
  it('uses section-specific questions without a claim', () => {
    const inc = rewriteRule('Participants must have physician-diagnosed asthma', 'inclusion');
    expect(inc.question).toBe('Could you explain this rule for joining: have physician-diagnosed asthma?');
    const exc = rewriteRule('Current smoker', 'exclusion');
    expect(exc.question).toBe('Could you explain this rule that may prevent joining: current smoker?');
    for (const r of [inc, exc]) expect(hasForbiddenClaim(r.question!)).toBe(false);
  });
  it('keeps numbers and comparison signs in order', () => {
    const r = rewriteRule('Age ≥ 18 years and BMI ≥ 25 kg/m2', 'inclusion');
    expect(r.outcome).toBe('question');
    expect(r.numberCheck.passed).toBe(true);
  });
  it('drops only leading boilerplate', () => {
    expect(stripBoilerplate('Patients must be willing to fast')).toBe('be willing to fast');
    expect(stripBoilerplate('Must have a smartphone')).toBe('have a smartphone');
    expect(stripBoilerplate('ECOG 0 or 1')).toBe('ECOG 0 or 1');
  });
});

describe('OpenAI-compatible request body', () => {
  it('sends store:false only to the OpenAI endpoint', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = (async (_u: unknown, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ choices: [{ message: { content: 'Do I meet the age rule of 18 years?' } }] }), { status: 200 }); }) as typeof fetch;
    const { rewriteCriterion } = await import('../src/plain.js');
    const key = ['fixture', 'value'].join('-');
    await rewriteCriterion('Age 18 years', { llm: { apiKey: key, model: 'm', fetcher } });
    await rewriteCriterion('Age 18 years', { llm: { apiKey: key, model: 'm', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', fetcher } });
    expect(bodies[0]).toHaveProperty('store', false);
    expect(bodies[1]).not.toHaveProperty('store');
  });
});

describe('question shape', () => {
  it('accepts natural first-person questions from a model', async () => {
    const { rewriteCriterion } = await import('../src/plain.js');
    const fetcher = (async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Am I between 18 and 75 years old and have an ECOG performance status of 0 or 1?' } }] }), { status: 200 })) as typeof fetch;
    const r = await rewriteCriterion('Adults aged 18 to 75 years with ECOG performance status 0 or 1', { llm: { apiKey: ['fixture', 'value'].join('-'), model: 'm', fetcher } });
    expect(r.outcome).toBe('question');
  });
});

describe('number check stays strict where it matters', () => {
  it('still protects roman stages, units and comparison words', async () => {
    const { checkNumbers } = await import('../src/plain.js');
    expect(checkNumbers('Stage IV breast cancer', 'Do I have stage II breast cancer?').passed).toBe(false);
    expect(checkNumbers('Stage IV breast cancer', 'Do I have stage IV breast cancer?').passed).toBe(true);
    expect(checkNumbers('Dose 50 mg daily', 'Do I take 50 mcg daily?').passed).toBe(false);
    expect(checkNumbers('HbA1c ≥ 7.5%', 'Is my HbA1c at least 7.5%?').passed).toBe(false);
    expect(checkNumbers('Aged 18 to 75 years', 'Am I between 18 and 75 years old?').passed).toBe(true);
    expect(checkNumbers('Aged 18 to 75 years', 'Am I between 18 and 65 years old?').passed).toBe(false);
  });
});
