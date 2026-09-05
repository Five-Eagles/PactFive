import type { PricingAnalysisRepository } from "../server/pricing-analysis.repository";
import {
  ProjectBudgetApplicationError,
  type ProjectBudgetApplicationInput,
  type ProjectBudgetApplicationPort,
  type ProjectBudgetApplicationResult,
} from "../server/project-budget-application.port";

export type MockProjectBudgetRecord = {
  projectId: string;
  clientId: string;
  budgetAmount: number;
  projectVersion: number;
  recruitmentOpen: boolean;
  hasPendingApplications: boolean;
};

/**
 * 검증을 모두 끝낸 뒤 분석 CAS와 예산 쓰기를 한 동기 commit 구간에서 수행한다.
 * 실제 통합 어댑터는 같은 계약을 DB transaction으로 구현해야 한다.
 */
export class InMemoryProjectBudgetApplicationPort implements ProjectBudgetApplicationPort {
  private readonly projects = new Map<string, MockProjectBudgetRecord>();
  private readonly calls: ProjectBudgetApplicationInput[] = [];
  private readonly idempotency = new Map<
    string,
    { requestFingerprint: string; result: ProjectBudgetApplicationResult }
  >();
  private commitTail: Promise<void> = Promise.resolve();

  constructor(
    projects: MockProjectBudgetRecord[],
    private readonly repository: PricingAnalysisRepository,
  ) {
    for (const project of projects) this.projects.set(project.projectId, { ...project });
  }

  async applyPricingAnalysisBudget(
    input: ProjectBudgetApplicationInput,
  ): Promise<ProjectBudgetApplicationResult> {
    let release!: () => void;
    const previousCommit = this.commitTail;
    this.commitTail = new Promise<void>((resolve) => { release = resolve; });
    await previousCommit;
    try {
      return await this.commit(input);
    } finally {
      release();
    }
  }

  private async commit(
    input: ProjectBudgetApplicationInput,
  ): Promise<ProjectBudgetApplicationResult> {
    const idempotencyScope = JSON.stringify([input.requesterId, input.idempotencyKey]);
    const replay = this.idempotency.get(idempotencyScope);
    if (replay) {
      if (replay.requestFingerprint !== input.requestFingerprint) {
        throw new ProjectBudgetApplicationError("IDEMPOTENCY_KEY_REUSED");
      }
      return { ...replay.result };
    }
    const project = this.projects.get(input.projectId);
    if (!project) throw new ProjectBudgetApplicationError("PROJECT_NOT_FOUND");
    if (project.clientId !== input.requesterId) {
      throw new ProjectBudgetApplicationError("PROJECT_FORBIDDEN");
    }
    if (project.hasPendingApplications) {
      throw new ProjectBudgetApplicationError("PROJECT_EDIT_LOCKED");
    }
    if (!project.recruitmentOpen) {
      throw new ProjectBudgetApplicationError("PROJECT_EDIT_CLOSED");
    }
    if (input.expectedBudgetAmount !== project.budgetAmount) {
      throw new ProjectBudgetApplicationError("PROJECT_BUDGET_CONFLICT");
    }
    if (
      input.expectedProjectVersion !== null &&
      input.expectedProjectVersion !== project.projectVersion
    ) {
      throw new ProjectBudgetApplicationError("PROJECT_VERSION_CONFLICT");
    }

    // 실패 가능한 검증을 먼저 끝내므로 아래 두 쓰기 사이에 의도된 실패 지점이 없다.
    const claimed = await this.repository.markAppliedIfApproved({
      analysisId: input.analysisId,
      requesterId: input.requesterId,
      projectId: input.projectId,
      appliedAt: input.appliedAt,
    });
    if (!claimed) {
      throw new ProjectBudgetApplicationError("PRICING_ANALYSIS_ALREADY_APPLIED");
    }

    project.budgetAmount = input.recommendedAmount;
    this.calls.push({ ...input });
    const result: ProjectBudgetApplicationResult = {
      pricingAnalysisId: input.analysisId,
      projectId: input.projectId,
      budgetAmount: project.budgetAmount,
      currency: "KRW",
      appliedAt: input.appliedAt,
      processedAt: input.processedAt,
      changed: true,
      projectVersion: project.projectVersion,
    };
    this.idempotency.set(idempotencyScope, {
      requestFingerprint: input.requestFingerprint,
      result: { ...result },
    });
    return result;
  }

  findProject(projectId: string): MockProjectBudgetRecord | null {
    const project = this.projects.get(projectId);
    return project ? { ...project } : null;
  }

  getCalls(): ProjectBudgetApplicationInput[] {
    return this.calls.map((call) => ({ ...call }));
  }
}
