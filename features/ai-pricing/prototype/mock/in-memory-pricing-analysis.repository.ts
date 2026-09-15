import type {
  MarkPricingAnalysisAppliedInput,
  PricingAnalysisRepository,
} from "../server/pricing-analysis.repository";
import type {
  PricingAnalysisFailureCode,
  PricingAnalysisPublicFailure,
  PricingAnalysisRecommendation,
  PricingAnalysisRow,
} from "../server/pricing-analysis.types";

function cloneRecommendation(
  result: PricingAnalysisRecommendation | null,
): PricingAnalysisRecommendation | null {
  return result
    ? {
        ...result,
        breakdown: result.breakdown.map((item) => ({ ...item })),
      }
    : null;
}

function cloneRow(row: PricingAnalysisRow): PricingAnalysisRow {
  return {
    ...row,
    inputSnapshot: { ...row.inputSnapshot },
    result: cloneRecommendation(row.result),
    failureSnapshot: row.failureSnapshot ? { ...row.failureSnapshot } : null,
  };
}

/** 테스트마다 새 인스턴스를 생성해 상태 누출을 막는 Step 2 저장소다. */
export class InMemoryPricingAnalysisRepository implements PricingAnalysisRepository {
  private readonly rows = new Map<string, PricingAnalysisRow>();

  constructor(seed: PricingAnalysisRow[] = []) {
    for (const row of seed) this.rows.set(row.analysisId, cloneRow(row));
  }

  async findById(analysisId: string): Promise<PricingAnalysisRow | null> {
    const row = this.rows.get(analysisId);
    return row ? cloneRow(row) : null;
  }

  async findByIdempotency(
    requesterId: string,
    idempotencyKey: string,
  ): Promise<PricingAnalysisRow | null> {
    const row = [...this.rows.values()].find(
      (candidate) =>
        candidate.requesterId === requesterId && candidate.idempotencyKey === idempotencyKey,
    );
    return row ? cloneRow(row) : null;
  }

  async reservePending(
    row: PricingAnalysisRow,
  ): Promise<{ kind: "inserted" } | { kind: "existing"; row: PricingAnalysisRow }> {
    if (this.rows.has(row.analysisId)) throw new Error("duplicate analysis id");
    const duplicateKey = [...this.rows.values()].find(
      (candidate) =>
        candidate.requesterId === row.requesterId &&
        candidate.idempotencyKey === row.idempotencyKey,
    );
    if (duplicateKey) return { kind: "existing", row: cloneRow(duplicateKey) };
    this.rows.set(row.analysisId, cloneRow(row));
    return { kind: "inserted" };
  }

  async markApprovedIfPending(
    analysisId: string,
    result: PricingAnalysisRecommendation,
    reviewedAt: string,
  ): Promise<boolean> {
    const row = this.rows.get(analysisId);
    if (!row || row.reviewStatus !== "PENDING") return false;
    this.rows.set(analysisId, {
      ...row,
      reviewStatus: "APPROVED",
      result: cloneRecommendation(result),
      failureCode: null,
      failureSnapshot: null,
      failureHttpStatus: null,
      reviewedAt,
    });
    return true;
  }

  async markRejectedIfPending(
    analysisId: string,
    failureCode: PricingAnalysisFailureCode,
    failureSnapshot: PricingAnalysisPublicFailure,
    failureHttpStatus: 502 | 504,
    reviewedAt: string,
  ): Promise<boolean> {
    const row = this.rows.get(analysisId);
    if (!row || row.reviewStatus !== "PENDING") return false;
    this.rows.set(analysisId, {
      ...row,
      reviewStatus: "REJECTED",
      result: null,
      failureCode,
      failureSnapshot: { ...failureSnapshot },
      failureHttpStatus,
      reviewedAt,
    });
    return true;
  }

  async markAppliedIfApproved(input: MarkPricingAnalysisAppliedInput): Promise<boolean> {
    const row = this.rows.get(input.analysisId);
    if (
      !row ||
      row.requesterId !== input.requesterId ||
      row.reviewStatus !== "APPROVED" ||
      !row.result ||
      row.projectId !== null ||
      row.appliedAt !== null
    ) {
      return false;
    }
    this.rows.set(row.analysisId, {
      ...row,
      projectId: input.projectId,
      appliedAt: input.appliedAt,
    });
    return true;
  }

  getAllRecords(): PricingAnalysisRow[] {
    return [...this.rows.values()].map(cloneRow);
  }
}
