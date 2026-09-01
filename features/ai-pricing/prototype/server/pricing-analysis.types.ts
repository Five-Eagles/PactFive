export type PricingAnalysisReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

/** project-management가 연 트랜잭션을 그대로 전달한다. ai-pricing은 열거나 commit하지 않는다. */
export type TransactionContext = { readonly id: string };

export type ClaimPricingAnalysisInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export type ClaimPricingAnalysisResult = {
  recommendedAmount: number;
};

export type PricingRecommendationQuery = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export type PricingAnalysisContractErrorCode =
  | "PRICING_ANALYSIS_NOT_CLAIMABLE"
  | "PRICING_ANALYSIS_NOT_APPLICABLE";

export class PricingAnalysisContractError extends Error {
  constructor(
    public readonly code: PricingAnalysisContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PricingAnalysisContractError";
  }
}
