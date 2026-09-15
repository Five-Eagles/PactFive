import type { PricingAnalysisCategory } from './pricing-analysis.constants';

/**
 * app/server/src/features/ai-pricing/pricing-analysis.types.ts 의 프론트 쪽 사본 — 화면이
 * 실제로 쓰는 응답 모양만 옮긴다. api-contract.md "공개 API" 절이 정본이다.
 */

export type PricingAnalysisReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PricingAnalysisInputSnapshot = {
  title: string;
  description: string;
  category: PricingAnalysisCategory;
};

export type PricingAnalysisBreakdownItem = {
  name: string;
  description: string;
  amount: number;
  rationale: string;
};

export type PricingAnalysisRecommendation = {
  recommendedAmount: number;
  currency: 'KRW';
  breakdown: PricingAnalysisBreakdownItem[];
};

export type PricingAnalysisPublicFailure = {
  code:
    | 'PRICING_ANALYSIS_PROVIDER_FAILED'
    | 'PRICING_ANALYSIS_TIMEOUT'
    | 'PRICING_ANALYSIS_INVALID_RESULT';
  message: string;
  retryable: boolean;
};

type PricingAnalysisResponseBase = {
  pricingAnalysisId: string;
  inputSnapshot: PricingAnalysisInputSnapshot;
  createdAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
};

export type PricingAnalysisResponse =
  | (PricingAnalysisResponseBase & {
      reviewStatus: 'PENDING';
      result: null;
      failure: null;
      reviewedAt: null;
    })
  | (PricingAnalysisResponseBase & {
      reviewStatus: 'APPROVED';
      result: PricingAnalysisRecommendation;
      failure: null;
      reviewedAt: string;
    })
  | (PricingAnalysisResponseBase & {
      reviewStatus: 'REJECTED';
      result: null;
      failure: PricingAnalysisPublicFailure;
      reviewedAt: string;
    });

export type CreatePricingAnalysisInput = {
  title: string;
  description: string;
  category: PricingAnalysisCategory | '';
};

export type ApplyPricingAnalysisResponse = {
  pricingAnalysisId: string;
  projectId: string;
  budgetAmount: number;
  currency: 'KRW';
  appliedAt: string;
  processedAt: string;
  changed: true;
  projectVersion: number;
};

/** api-contract.md의 24개 API 오류 코드 중 화면이 분기하는 것들. 그 외는 status로 처리한다. */
export type PricingAnalysisApiErrorCode =
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'PRICING_ANALYSIS_ALREADY_APPLIED'
  | 'PROJECT_EDIT_LOCKED'
  | 'PROJECT_EDIT_CLOSED'
  | 'PROJECT_VERSION_CONFLICT'
  | 'PROJECT_BUDGET_CONFLICT'
  | (string & {});

export type PricingAnalysisApiErrorDetails = {
  fields?: Array<{ field: string; reason: string }>;
  analysis?: PricingAnalysisResponse;
};
