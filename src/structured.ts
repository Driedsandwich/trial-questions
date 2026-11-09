import type { Eligibility } from './ctgov.js';
export type CheckStatus = 'matched' | 'not_matched' | 'ask_doctor';
export interface UserProfile { /** Age in years, as entered; no conversion from birth dates. */ age?: number; sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' }
export interface StructuredCheck {
  field: 'minimumAge' | 'maximumAge' | 'sex' | 'healthyVolunteers';
  original: string; status: CheckStatus; reason: string;
}
export const STATUS_LABELS: Record<CheckStatus, string> = {
  matched: 'Compared: matches this field only', not_matched: 'Compared: does not match this field', ask_doctor: 'Ask your doctor',
};
export function checkStructured(eligibility: Eligibility, profile: UserProfile = {}): StructuredCheck[] {
  const result: StructuredCheck[] = [];
  for (const field of ['minimumAge', 'maximumAge'] as const) {
    const raw = eligibility[field];
    const parsed = raw?.match(/^(\d+(?:\.\d+)?)\s+Years?$/i);
    const bound = parsed ? Number(parsed[1]) : undefined;
    let status: CheckStatus = 'ask_doctor';
    let reason = 'Missing or unsupported age boundary or user age; ask your doctor.';
    if (profile.age !== undefined && Number.isFinite(profile.age) && profile.age >= 0 && bound !== undefined && Number.isFinite(bound)) {
      status = (field === 'minimumAge' ? profile.age >= bound : profile.age <= bound) ? 'matched' : 'not_matched';
      reason = 'Numeric comparison with the entered age in years only; this is not a trial participation decision.';
    }
    result.push({ field, original: `${field}: ${raw ?? 'Not provided'}`, status, reason });
  }
  const knownSex = profile.sex === 'MALE' || profile.sex === 'FEMALE';
  result.push({ field: 'sex', original: `sex: ${eligibility.sex ?? 'Not provided'}`,
    status: knownSex && eligibility.sex ? (eligibility.sex === 'ALL' || eligibility.sex === profile.sex ? 'matched' : 'not_matched') : 'ask_doctor',
    reason: 'Comparison uses the entered value and the registry sex field only; medical interpretation is for your doctor.' });
  result.push({ field: 'healthyVolunteers', original: `healthyVolunteers: ${eligibility.healthyVolunteers === undefined ? 'Not provided' : eligibility.healthyVolunteers}`,
    status: 'ask_doctor', reason: 'Age and sex do not establish healthy-volunteer status. Ask your doctor.' });
  return result;
}
