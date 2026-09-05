export type ProjectBudgetApplicationInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
  recommendedAmount: number;
  expectedBudgetAmount: number;
  expectedProjectVersion: number | null;
  idempotencyKey: string;
  requestFingerprint: string;
  appliedAt: string;
  processedAt: string;
};

export type ProjectBudgetApplicationResult = {
  pricingAnalysisId: string;
  projectId: string;
  budgetAmount: number;
  currency: "KRW";
  appliedAt: string;
  processedAt: string;
  changed: true;
  projectVersion: number;
};

export type ProjectBudgetApplicationErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_FORBIDDEN"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PRICING_ANALYSIS_ALREADY_APPLIED"
  | "PROJECT_EDIT_LOCKED"
  | "PROJECT_EDIT_CLOSED"
  | "PROJECT_VERSION_CONFLICT"
  | "PROJECT_BUDGET_CONFLICT"
  | "STORAGE_FAILED";

export class ProjectBudgetApplicationError extends Error {
  constructor(public readonly code: ProjectBudgetApplicationErrorCode) {
    super("프로젝트 예산에 분석 결과를 반영하지 못했습니다.");
    this.name = "ProjectBudgetApplicationError";
  }
}

/**
 * project-management가 구현하는 outbound port다. 구현체는 project 예산 갱신과
 * pricing_analyses.applied_at CAS를 반드시 하나의 DB transaction에서 처리해야 한다.
 * 부분 갱신을 허용하는 두 개의 메서드로 분리하지 않는다.
 */
export interface ProjectBudgetApplicationPort {
  applyPricingAnalysisBudget(
    input: ProjectBudgetApplicationInput,
  ): Promise<ProjectBudgetApplicationResult>;
}
