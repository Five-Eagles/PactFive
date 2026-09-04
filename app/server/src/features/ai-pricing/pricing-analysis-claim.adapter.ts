import type { PricingAnalysisRepository } from './pricing-analysis.repository';

/**
 * project-management 가 정의한 `PricingAnalysisClaimPort`(project.port.ts)의 실제 구현.
 *
 * CR-0003(유동우 제기, 2026-08-26, features/project-management/change-requests/
 * 0003-pricing-analysis-recommendation-read.md) 회신 — `getPricingAnalysisRecommendation`을
 * 제안된 모양 그대로 확정한다.
 *
 * project-management 타입을 여기서 import하지 않는다(app/web/AGENTS.md "폴더 간 접점") —
 * 구조적으로 같은 모양만 선언해 두고 app.ts가 `ExternalPorts.pricing` 자리에 끼운다.
 */

type TransactionContext = { readonly id: string };

type ClaimPricingAnalysisInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

type ClaimPricingAnalysisResult = {
  recommendedAmount: number;
};

type PricingRecommendationQuery = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export function createPricingAnalysisClaimPort(repository: PricingAnalysisRepository) {
  return {
    /**
     * 등록 트랜잭션 안에서 호출된다 (project-management spec.md 규칙 52). "연결"도 결국
     * ai-pricing 쪽에서는 같은 CAS(`markAppliedIfApproved`)다 — 기존 프로젝트에 적용하는
     * 경로(project-budget-application.adapter.ts)와 저장소 계약을 공유한다.
     */
    async claimPricingAnalysisForCreatedProject(
      _transaction: TransactionContext,
      input: ClaimPricingAnalysisInput,
    ): Promise<ClaimPricingAnalysisResult> {
      const row = await repository.findById(input.analysisId);
      if (!row || row.requesterId !== input.requesterId || row.reviewStatus !== 'APPROVED' || !row.result) {
        throw new Error(`PRICING_ANALYSIS_NOT_CLAIMABLE: ${input.analysisId}`);
      }
      const claimed = await repository.markAppliedIfApproved({
        analysisId: input.analysisId,
        requesterId: input.requesterId,
        projectId: input.projectId,
        appliedAt: new Date().toISOString(),
      });
      if (!claimed) throw new Error(`PRICING_ANALYSIS_NOT_CLAIMABLE: ${input.analysisId}`);
      return { recommendedAmount: row.result.recommendedAmount };
    },

    /** CR-0003 — 이미 등록된 프로젝트의 예산 반영(규칙 40)용 읽기 전용 조회. 연결하지 않는다. */
    async getPricingAnalysisRecommendation(
      query: PricingRecommendationQuery,
    ): Promise<ClaimPricingAnalysisResult> {
      const row = await repository.findById(query.analysisId);
      if (!row || row.requesterId !== query.requesterId || row.reviewStatus !== 'APPROVED' || !row.result) {
        throw new Error(`PRICING_ANALYSIS_NOT_APPLICABLE: ${query.analysisId}`);
      }
      return { recommendedAmount: row.result.recommendedAmount };
    },
  };
}
