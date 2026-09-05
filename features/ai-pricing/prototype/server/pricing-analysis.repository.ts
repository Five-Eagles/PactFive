import type {
  PricingAnalysisFailureCode,
  PricingAnalysisPublicFailure,
  PricingAnalysisRecommendation,
  PricingAnalysisRow,
} from "./pricing-analysis.types";

export type MarkPricingAnalysisAppliedInput = {
  analysisId: string;
  requesterId: string;
  projectId: string;
  appliedAt: string;
};

/** DB 구현이 대체할 수 있는 분석 저장소 경계다. */
export interface PricingAnalysisRepository {
  findById(analysisId: string): Promise<PricingAnalysisRow | null>;
  findByIdempotency(
    requesterId: string,
    idempotencyKey: string,
  ): Promise<PricingAnalysisRow | null>;
  reservePending(
    row: PricingAnalysisRow,
  ): Promise<{ kind: "inserted" } | { kind: "existing"; row: PricingAnalysisRow }>;
  markApprovedIfPending(
    analysisId: string,
    result: PricingAnalysisRecommendation,
    reviewedAt: string,
  ): Promise<boolean>;
  markRejectedIfPending(
    analysisId: string,
    failureCode: PricingAnalysisFailureCode,
    failureSnapshot: PricingAnalysisPublicFailure,
    failureHttpStatus: 502 | 504,
    reviewedAt: string,
  ): Promise<boolean>;
  /** 실제 DB 구현은 project 예산 갱신과 같은 transaction에서 이 CAS를 실행한다. */
  markAppliedIfApproved(input: MarkPricingAnalysisAppliedInput): Promise<boolean>;
}
