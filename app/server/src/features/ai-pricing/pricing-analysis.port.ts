import type {
  ClaimPricingAnalysisInput,
  ClaimPricingAnalysisResult,
  PricingRecommendationQuery,
  TransactionContext,
} from "./pricing-analysis.types";

/**
 * ai-pricing이 project-management에 제공하는 내부 포트.
 * 공개 HTTP API가 아니며 두 메서드 모두 저장된 recommendedAmount만 반환한다.
 */
export interface PricingAnalysisClaimPort {
  claimPricingAnalysisForCreatedProject(
    transaction: TransactionContext,
    input: ClaimPricingAnalysisInput,
  ): Promise<ClaimPricingAnalysisResult>;

  /** 기존 프로젝트의 C-05 예산 반영 전에 호출하는 읽기 전용 조회다. */
  getPricingAnalysisRecommendation(
    query: PricingRecommendationQuery,
  ): Promise<ClaimPricingAnalysisResult>;
}
