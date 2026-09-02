import type { PricingAnalysisClaimPort } from "../server/pricing-analysis.port";
import {
  PricingAnalysisContractError,
  type ClaimPricingAnalysisInput,
  type ClaimPricingAnalysisResult,
  type PricingAnalysisReviewStatus,
  type PricingRecommendationQuery,
  type TransactionContext,
} from "../server/pricing-analysis.types";

export type InMemoryPricingAnalysisRecord = {
  id: string;
  requesterId: string;
  projectId: string | null;
  recommendedAmount: number;
  reviewStatus: PricingAnalysisReviewStatus;
  appliedAt: Date | null;
};

type ClaimCall = {
  transaction: TransactionContext;
  input: ClaimPricingAnalysisInput;
};

/**
 * 금요일 계약 검증용 인메모리 어댑터다. AI 분석 생성이나 projects 갱신은 하지 않는다.
 * 통합 단계에서는 같은 포트를 실제 pricing_analyses 저장소 구현으로 교체한다.
 */
export class InMemoryPricingAnalysisAdapter implements PricingAnalysisClaimPort {
  private readonly records = new Map<string, InMemoryPricingAnalysisRecord>();
  private readonly claimCalls: ClaimCall[] = [];
  private readonly recommendationQueries: PricingRecommendationQuery[] = [];

  constructor(
    records: InMemoryPricingAnalysisRecord[],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const record of records) {
      this.records.set(record.id, { ...record });
    }
  }

  async claimPricingAnalysisForCreatedProject(
    transaction: TransactionContext,
    input: ClaimPricingAnalysisInput,
  ): Promise<ClaimPricingAnalysisResult> {
    const record = this.records.get(input.analysisId);
    if (
      !record ||
      record.requesterId !== input.requesterId ||
      record.reviewStatus !== "APPROVED" ||
      record.appliedAt !== null ||
      record.projectId !== null
    ) {
      throw new PricingAnalysisContractError(
        "PRICING_ANALYSIS_NOT_CLAIMABLE",
        "프로젝트 생성에 연결할 수 없는 단가 분석입니다.",
      );
    }

    const appliedAt = this.now();
    this.records.set(record.id, {
      ...record,
      projectId: input.projectId,
      appliedAt,
    });
    this.claimCalls.push({ transaction, input: { ...input } });
    return { recommendedAmount: record.recommendedAmount };
  }

  async getPricingAnalysisRecommendation(
    query: PricingRecommendationQuery,
  ): Promise<ClaimPricingAnalysisResult> {
    const record = this.records.get(query.analysisId);
    const belongsToAnotherProject = record?.projectId !== null && record?.projectId !== query.projectId;
    if (
      !record ||
      record.requesterId !== query.requesterId ||
      record.reviewStatus !== "APPROVED" ||
      belongsToAnotherProject
    ) {
      throw new PricingAnalysisContractError(
        "PRICING_ANALYSIS_NOT_APPLICABLE",
        "이 프로젝트에 반영할 수 없는 단가 분석입니다.",
      );
    }

    this.recommendationQueries.push({ ...query });
    return { recommendedAmount: record.recommendedAmount };
  }

  findById(analysisId: string): InMemoryPricingAnalysisRecord | null {
    const record = this.records.get(analysisId);
    return record ? { ...record } : null;
  }

  getClaimCalls(): ClaimCall[] {
    return this.claimCalls.map((call) => ({
      transaction: call.transaction,
      input: { ...call.input },
    }));
  }

  getRecommendationQueries(): PricingRecommendationQuery[] {
    return this.recommendationQueries.map((query) => ({ ...query }));
  }
}
