import { toIsoDeadlineOrEmpty, toIsoStartOfDayOrEmpty } from '../../shared/date';
import type { CreateProjectRequest } from './project.types';

export type RegisterDraft = {
  title: string;
  description: string;
  category: string;
  recruitmentStartAt: string;
  recruitmentDeadlineAt: string;
  budgetAmount: string;
  skillIds: string[];
  // Optional so existing version 1 drafts keep their inputs after this addition.
  pricingAnalysisId?: string | null;
};

export const EMPTY_REGISTER_DRAFT: RegisterDraft = {
  title: '',
  description: '',
  category: '',
  recruitmentStartAt: '',
  recruitmentDeadlineAt: '',
  budgetAmount: '',
  skillIds: [],
  pricingAnalysisId: null,
};

/** Commas are display formatting; the server still validates the submitted amount. */
function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, '').trim());
}

/** Keep the displayed recommendation and its ID in the same persisted draft. */
export function applyPricingRecommendation(
  draft: RegisterDraft,
  params: URLSearchParams,
): RegisterDraft {
  const ids = params.getAll('pricingAnalysisId');
  const budgets = params.getAll('recommendedBudget');
  if (ids.length !== 1 || budgets.length !== 1) return draft;

  const pricingAnalysisId = ids[0].trim();
  const amount = toAmount(budgets[0]);
  if (!pricingAnalysisId || !Number.isSafeInteger(amount) || amount <= 0) return draft;

  // This amount is only for display. The server claims the analysis and uses its own amount.
  return { ...draft, budgetAmount: String(amount), pricingAnalysisId };
}

/** A manual amount must not be overwritten by the old AI recommendation on the server. */
export function updateRegistrationBudget(draft: RegisterDraft, budgetAmount: string): RegisterDraft {
  const amount = toAmount(budgetAmount);
  const unchanged = Number.isSafeInteger(amount) && amount > 0 && amount === toAmount(draft.budgetAmount);
  return {
    ...draft,
    budgetAmount,
    pricingAnalysisId: unchanged ? draft.pricingAnalysisId : null,
  };
}

export function buildProjectRegistrationRequest(draft: RegisterDraft): CreateProjectRequest {
  return {
    title: draft.title,
    description: draft.description,
    category: draft.category,
    recruitmentStartAt: toIsoStartOfDayOrEmpty(draft.recruitmentStartAt) || null,
    recruitmentDeadlineAt: toIsoDeadlineOrEmpty(draft.recruitmentDeadlineAt),
    budgetAmount: toAmount(draft.budgetAmount),
    skillIds: [...draft.skillIds],
    // ai-pricing spec: only an unchanged, accepted recommendation is handed off at registration.
    ...(draft.pricingAnalysisId ? { pricingAnalysisId: draft.pricingAnalysisId } : {}),
  };
}
