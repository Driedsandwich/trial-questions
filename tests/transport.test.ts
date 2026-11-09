import { describe, it, expect, vi } from 'vitest';
import { CtgovClient, FIELDS } from '../src/ctgov.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const data = { protocolSection: { identificationModule: { nctId: 'NCT00000000', briefTitle: 'Synthetic fixture' }, statusModule: { overallStatus: 'RECRUITING' }, eligibilityModule: { eligibilityCriteria: 'Age 18 years', minimumAge: '18 Years', healthyVolunteers: false, sex: 'ALL' } } };

describe('API fields, filters, validation and shared throttling', () => {
  it('binds the native browser fetch receiver and returns registry locations', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async function(this: unknown) {
      expect(this).toBe(globalThis);
      return new Response(JSON.stringify({ studies: [{ protocolSection: { ...data.protocolSection,
        contactsLocationsModule: { locations: [{ city: 'Example City', country: 'Example Country', status: 'RECRUITING' }] },
      } }] }));
    });
    try {
      const result = await new CtgovClient().searchTrials();
      expect(result.trials[0]?.locations).toEqual([{ city: 'Example City', country: 'Example Country', status: 'RECRUITING' }]);
    } finally { fetcher.mockRestore(); }
  });
  it('projects required fields, handles pagination and serializes concurrent clients after errors', async () => {
    const starts: number[] = [], urls: URL[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      starts.push(Date.now()); const url = new URL(String(input)); urls.push(url);
      if (starts.length === 2) return new Response('', { status: 503 });
      return new Response(JSON.stringify(url.pathname.endsWith('NCT00000000') ? data : { studies: [data], totalCount: 12, nextPageToken: 'next' }), { headers: { Date: 'Mon, 09 Nov 2026 00:00:00 GMT' } });
    }) as unknown as typeof fetch;
    const a = new CtgovClient(fetcher), b = new CtgovClient(fetcher);
    const results = await Promise.allSettled([
      a.searchTrials({ condition: 'a condition', region: 'Tokyo', status: ['RECRUITING'], pageSize: 10, pageToken: 'page token' }),
      b.getTrial('NCT00000000'), a.getTrial('nct00000000'),
    ]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1000);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1000);
    for (const url of urls) expect(url.searchParams.get('fields')).toBe(FIELDS);
    expect(urls[0]!.searchParams.get('query.cond')).toBe('a condition');
    expect(urls[0]!.searchParams.get('query.locn')).toBe('Tokyo');
    expect(urls[0]!.searchParams.get('filter.overallStatus')).toBe('RECRUITING');
    expect(urls[0]!.searchParams.get('pageToken')).toBe('page token');
    if (results[0]!.status === 'fulfilled') expect(results[0]!.value).toMatchObject({ nextPageToken: 'next', totalCount: 12, source: { attribution: 'Data from ClinicalTrials.gov', apiResponseDate: 'Mon, 09 Nov 2026 00:00:00 GMT' } });
    expect(vi.mocked(fetcher).mock.calls[0]![1]!.cache).toBe('no-store');
  }, 15_000);
  it('rejects invalid IDs and page sizes before calling the API', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const client = new CtgovClient(fetcher);
    await expect(client.getTrial('../../private')).rejects.toThrow('NCT');
    await expect(client.searchTrials({ pageSize: 0 })).rejects.toThrow('pageSize');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects malformed upstream data instead of inventing missing records', async () => {
    const client = new CtgovClient(async () => new Response(JSON.stringify({ unexpected: true })));
    await expect(client.getTrial('NCT00000000')).rejects.toThrow();
  }, 5000);
});

it('starts the real stdio server, initializes MCP and lists both tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', fileURLToPath(new URL('../mcp/server.ts', import.meta.url))], env: { TMPDIR: tmpdir() }, stderr: 'pipe' });
  const client = new Client({ name: 'synthetic-test-client', version: '1.0.0' });
  try {
    await client.connect(transport);
    const result = await client.listTools();
    expect(result.tools.map(t => t.name).sort()).toEqual(['get_trial_checklist', 'search_trials']);
    expect(result.tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
    const bad = await client.callTool({ name: 'get_trial_checklist', arguments: { nctId: 'invalid' } });
    expect(bad.isError).toBe(true);
  } finally { await client.close(); }
}, 15_000);
