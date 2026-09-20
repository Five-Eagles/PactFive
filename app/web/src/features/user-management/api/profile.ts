import { http } from '../../../shared/http';
export type Profile = { name: string; profileImageUrl: string | null; bio: string | null; companyName?: string | null; businessField?: string | null; businessFieldEtc?: string | null; websiteUrl?: string | null; primaryCategory?: string | null; careerYears?: number | null; hourlyRateAmount?: number | null; portfolioUrl?: string | null; skills?: string[] };
export const profileApi = {
  get: () => http.get<{ profile: Profile; complete: boolean }>('/v1/profiles/me'),
  save: (profile: Profile) => http.patch<{ profile: Profile }>('/v1/profiles/me', profile),
};
