import { randomUUID } from 'node:crypto';
import type { PricingAnalysisRepository } from './pricing-analysis.repository';
import {
  ProjectBudgetApplicationError,
  type ProjectBudgetApplicationInput,
  type ProjectBudgetApplicationPort,
  type ProjectBudgetApplicationResult,
} from './project-budget-application.port';

/**
 * project-budget-application.port.ts 의 실제 구현.
 *
 * ## 왜 project-management 를 직접 구현하지 않고 위임하나
 *
 * project-management 는 이미 이 일을 하는 "계약 함수 7"(`applyPricingAnalysisBudget`,
 * 규칙 40, `project-contract.service.ts`)을 갖고 있다 — `PROJECT_FORBIDDEN`·
 * `PROJECT_EDIT_LOCKED`·버전 충돌 검증과 예산 쓰기를 이미 처리한다. 오민혁의 Step 2
 * 프로토타입은 이 사실을 모른 채(별도로) `ProjectBudgetApplicationPort`를 설계했다 —
 * 두 설계가 같은 멱등키 형식(`pricing-apply-{analysisId}`)에 우연히 도달한 것이 그 증거다.
 *
 * 팀장 결정(2026-09-04, 오후 회의 전 확인): 예산 쓰기·잠금 검증은 project-management의
 * 기존 함수를 그대로 재사용해 중복 구현하지 않는다. 이 어댑터는 그 호출이 성공한 뒤
 * ai-pricing 자신의 `pricing_analyses.applied_at` CAS(+ CR-AP-003/ERD E-36의
 * `pricing_application_receipts` 기록 책임)만 진다.
 *
 * contracts-payments의 `project-management.adapter.ts`와 같은 원칙 — 기능 폴더 간 직접
 * import는 금지(app/web/AGENTS.md "폴더 간 접점")이므로 project-management의 타입을 여기서
 * import하지 않는다. 필요한 모양만 구조적으로 선언해 두고 app.ts가 실제 구현
 * (`projectContractService`)을 끼운다.
 *
 * ## 알려진 gap — CR 필요 (유동우 확인 대기)
 *
 * project-management의 계약 함수 7은 현재 `PROJECT_EDIT_CLOSED`(마감·거래 시작)와
 * 예산 conflict(`expectedBudgetAmount` 불일치)를 검증하지 않는다. 이 어댑터는 그 두 코드를
 * 스스로 검증하지 않는다(위임 원칙상 중복 구현하지 않기로 했다) — 그래서 지금은 이 두
 * `ProjectBudgetApplicationErrorCode`가 이 경로에서 발생하지 않는다. 보완은 별도 CR로
 * project-management 쪽에 요청한다.
 */

export type ApplyPricingAnalysisBudgetDelegateInput = {
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
  expectedProjectVersion?: number;
  actorUserId: string;
  pricingAnalysisId: string;
};

export type ApplyPricingAnalysisBudgetDelegateResult = {
  alreadyProcessed: boolean;
  processedAt: string;
  changed: boolean;
  projectVersion: number;
  projectId: string;
  budgetAmount: number;
};

/** project-management 가 던지는 오류(ProjectContractError)의 구조적 모양만 본다. */
type DelegateErrorLike = { body?: { error?: { code?: string } } };

export type ProjectBudgetApplicationDelegate = {
  applyPricingAnalysisBudget(
    projectId: string,
    input: ApplyPricingAnalysisBudgetDelegateInput,
  ): Promise<ApplyPricingAnalysisBudgetDelegateResult>;
};

function delegateErrorCode(error: unknown): string | undefined {
  return (error as DelegateErrorLike | undefined)?.body?.error?.code;
}

export class ProjectBudgetApplicationAdapter implements ProjectBudgetApplicationPort {
  private readonly idempotency = new Map<
    string,
    { requestFingerprint: string; result: ProjectBudgetApplicationResult }
  >();
  private commitTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly delegate: ProjectBudgetApplicationDelegate,
    private readonly pricingAnalyses: PricingAnalysisRepository,
  ) {}

  async applyPricingAnalysisBudget(
    input: ProjectBudgetApplicationInput,
  ): Promise<ProjectBudgetApplicationResult> {
    let release!: () => void;
    const previousCommit = this.commitTail;
    this.commitTail = new Promise<void>((resolve) => {
      release = resolve;
    });
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
        throw new ProjectBudgetApplicationError('IDEMPOTENCY_KEY_REUSED');
      }
      return { ...replay.result };
    }

    let delegated: ApplyPricingAnalysisBudgetDelegateResult;
    try {
      delegated = await this.delegate.applyPricingAnalysisBudget(input.projectId, {
        requestId: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.processedAt,
        expectedProjectVersion: input.expectedProjectVersion ?? undefined,
        actorUserId: input.requesterId,
        pricingAnalysisId: input.analysisId,
      });
    } catch (error) {
      const code = delegateErrorCode(error);
      if (code === 'PROJECT_NOT_FOUND') throw new ProjectBudgetApplicationError('PROJECT_NOT_FOUND');
      if (code === 'PROJECT_FORBIDDEN') throw new ProjectBudgetApplicationError('PROJECT_FORBIDDEN');
      if (code === 'PROJECT_EDIT_LOCKED') throw new ProjectBudgetApplicationError('PROJECT_EDIT_LOCKED');
      if (code === 'PROJECT_VERSION_CONFLICT') {
        throw new ProjectBudgetApplicationError('PROJECT_VERSION_CONFLICT');
      }
      throw new ProjectBudgetApplicationError('STORAGE_FAILED');
    }

    // project-management 쪽 예산 쓰기는 이미 끝났다. 이제 ai-pricing 자신의
    // pricing_analyses.applied_at 을 CAS한다 — 두 쓰기가 진짜 하나의 DB transaction이
    // 아니므로(Prisma 미도입, in-memory-first 단계) 이 사이에서 실패하면 상태 불일치가
    // 남을 수 있다. Prisma 도입 시 두 저장소가 같은 클라이언트를 쓰게 되면
    // `prisma.$transaction(...)`으로 묶어야 한다 ([PRISMA-GAP-6]).
    let claimed: boolean;
    try {
      claimed = await this.pricingAnalyses.markAppliedIfApproved({
        analysisId: input.analysisId,
        requesterId: input.requesterId,
        projectId: input.projectId,
        appliedAt: input.appliedAt,
      });
    } catch {
      throw new ProjectBudgetApplicationError('STORAGE_FAILED');
    }
    if (!claimed) {
      throw new ProjectBudgetApplicationError('PRICING_ANALYSIS_ALREADY_APPLIED');
    }

    const result: ProjectBudgetApplicationResult = {
      pricingAnalysisId: input.analysisId,
      projectId: delegated.projectId,
      budgetAmount: delegated.budgetAmount,
      currency: 'KRW',
      appliedAt: input.appliedAt,
      processedAt: input.processedAt,
      changed: true,
      projectVersion: delegated.projectVersion,
    };
    this.idempotency.set(idempotencyScope, {
      requestFingerprint: input.requestFingerprint,
      result: { ...result },
    });
    return result;
  }
}
