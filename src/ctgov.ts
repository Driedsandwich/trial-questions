import { z } from 'zod';

export const RECRUITMENT_STATUSES = ['RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION', 'COMPLETED', 'SUSPENDED', 'TERMINATED', 'WITHDRAWN', 'UNKNOWN', 'AVAILABLE', 'NO_LONGER_AVAILABLE', 'TEMPORARILY_NOT_AVAILABLE', 'APPROVED_FOR_MARKETING', 'WITHHELD'] as const;
export type RecruitmentStatus = typeof RECRUITMENT_STATUSES[number];
export const eligibilitySchema = z.object({
  eligibilityCriteria: z.string().optional(), minimumAge: z.string().optional(),
  maximumAge: z.string().optional(), sex: z.enum(['ALL', 'FEMALE', 'MALE']).optional(),
  healthyVolunteers: z.boolean().optional(),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;
const studySchema = z.object({ protocolSection: z.object({
  identificationModule: z.object({ nctId: z.string().regex(/^NCT\d{8}$/), briefTitle: z.string() }),
  statusModule: z.object({ overallStatus: z.string(), lastUpdatePostDateStruct: z.object({ date: z.string() }).optional() }),
  eligibilityModule: eligibilitySchema.optional(),
  contactsLocationsModule: z.object({ locations: z.array(z.object({
    facility: z.string().optional(), city: z.string().optional(), state: z.string().optional(),
    country: z.string().optional(), status: z.string().optional(),
  })).optional() }).optional(),
}) });
export interface Provenance {
  attribution: 'Data from ClinicalTrials.gov'; url: string; retrievedAt: string;
  processedAt: string; apiResponseDate?: string; lastUpdatePosted?: string;
}
export interface TrialLocation { facility?: string; city?: string; state?: string; country?: string; status?: string }
export interface Trial { nctId: string; title: string; overallStatus: string; eligibility: Eligibility; source: Provenance; locations?: TrialLocation[] }
export interface SearchOptions {
  condition?: string; region?: string; status?: RecruitmentStatus[]; pageSize?: number; pageToken?: string;
}
export interface SearchResult { trials: Trial[]; nextPageToken?: string; totalCount?: number; source: Provenance }
export const FIELDS = ['NCTId', 'BriefTitle', 'OverallStatus', 'EligibilityCriteria', 'MinimumAge', 'MaximumAge', 'Sex', 'HealthyVolunteers', 'LastUpdatePostDate', 'LocationFacility', 'LocationCity', 'LocationState', 'LocationCountry', 'LocationStatus'].join(',');
const API = 'https://clinicaltrials.gov/api/v2/studies';
// One queue for ALL clients in this JS process. Wait a full second after each
// response (including failures) before starting the next request. No disk cache.
let queue: Promise<unknown> = Promise.resolve();
let nextAllowedAt = 0;
async function queued<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(async () => {
    const delay = nextAllowedAt - Date.now();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    try { return await work(); } finally { nextAllowedAt = Date.now() + 1000; }
  });
  queue = result.catch(() => undefined);
  return result;
}
export class CtgovClient {
  // Window.fetch needs its native receiver when invoked as a client method.
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async request(url: URL): Promise<{ data: unknown; source: Provenance }> {
    return queued(async () => {
      const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`ClinicalTrials.gov HTTP ${response.status}`);
      const retrievedAt = new Date().toISOString();
      const apiResponseDate = response.headers.get('date') ?? undefined;
      return { data: await response.json(), source: { attribution: 'Data from ClinicalTrials.gov', url: url.toString(), retrievedAt, processedAt: retrievedAt, apiResponseDate } };
    });
  }
  async searchTrials(options: SearchOptions = {}): Promise<SearchResult> {
    const pageSize = options.pageSize ?? 10;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('pageSize must be an integer from 1 to 100');
    for (const status of options.status ?? []) if (!RECRUITMENT_STATUSES.includes(status)) throw new Error('Unknown recruitment status');
    const url = new URL(API);
    url.searchParams.set('fields', FIELDS);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('countTotal', 'true');
    if (options.condition?.trim()) url.searchParams.set('query.cond', options.condition.trim());
    if (options.region?.trim()) url.searchParams.set('query.locn', options.region.trim());
    if (options.status?.length) url.searchParams.set('filter.overallStatus', options.status.join(','));
    if (options.pageToken) url.searchParams.set('pageToken', options.pageToken);
    const { data, source } = await this.request(url);
    const parsed = z.object({ studies: z.array(studySchema), nextPageToken: z.string().optional(), totalCount: z.number().optional() }).parse(data);
    return { trials: parsed.studies.map(s => mapStudy(s, source)), nextPageToken: parsed.nextPageToken, totalCount: parsed.totalCount, source };
  }
  async getTrial(nctId: string): Promise<Trial> {
    const id = nctId.trim().toUpperCase();
    if (!/^NCT\d{8}$/.test(id)) throw new Error('Expected NCT followed by eight digits');
    const url = new URL(`${API}/${id}`);
    url.searchParams.set('fields', FIELDS);
    const { data, source } = await this.request(url);
    const trial = mapStudy(studySchema.parse(data), source);
    if (trial.nctId !== id) throw new Error('ClinicalTrials.gov returned a different NCT ID');
    return trial;
  }
}
function mapStudy(study: z.infer<typeof studySchema>, source: Provenance): Trial {
  const p = study.protocolSection;
  return { nctId: p.identificationModule.nctId, title: p.identificationModule.briefTitle,
    overallStatus: p.statusModule.overallStatus, eligibility: p.eligibilityModule ?? {}, locations: p.contactsLocationsModule?.locations ?? [],
    source: { ...source, url: `https://clinicaltrials.gov/study/${p.identificationModule.nctId}`, lastUpdatePosted: p.statusModule.lastUpdatePostDateStruct?.date } };
}
const defaultClient = new CtgovClient();
export const searchTrials = (options?: SearchOptions): Promise<SearchResult> => defaultClient.searchTrials(options);
export const getTrial = (nctId: string): Promise<Trial> => defaultClient.getTrial(nctId);
