/**
 * 계약 함수 구현 — 다른 도메인이 부르는 7종 (`/internal/v1`)
 *
 * 원본: features/project-management/prototype/server/project-contract.service.ts (3e4977e)
 * 나머지 하나 `cancelProject` 는 의뢰인 요청이라 공개 API(A-07)에 있다.
 *
 * 2026-08-27 통합에서는 contracts-payments 폴더의
 * `in-memory-project-transaction.adapter.ts` 가 이 자리를 임시로 대신했다.
 * 이번 통합에서 원래 설계대로 소유권을 이 파일로 되돌렸다 —
 * feedback_loop/2026-08-28/project-management.md 항목 1.
 *
 * ## 이 파일이 지키는 세 가지
 *
 * 1. **멱등** — 같은 중복 방지 키로 두 번 들어오면 최초 결과를 그대로 돌려준다 (규칙 43).
 *    키에서 ID 를 잘라 쓰지 않는다. 키는 판별용일 뿐이다.
 * 2. **버전** — 상태 축이 **실제로 바뀐** 호출에서만 +1 한다 (규칙 44).
 *    `markPaymentPending` 은 두 축을 안 바꾸므로 올리지 않는다.
 * 3. **판정 순서** — 문서에 적힌 순서를 그대로 따른다. 순서가 틀리면
 *    정상 재시도가 409 를 받고 화면에 사실과 다른 안내가 뜬다.
 */

import type { ProjectRepository } from './project.repository';
import { ProjectContractError } from './project.types';
import type { ExternalPorts } from './project.port';
import type {
  AcceptApplicationInput,
  AcceptApplicationResult,
  ApplyPricingBudgetInput,
  ApplyPricingBudgetResult,
  CompleteTransactionInput,
  CompleteTransactionResult,
  ContractEnvelope,
  MarkPaymentPendingInput,
  MarkPaymentPendingResult,
  NegotiationContext,
  NotReopenedReason,
  ProjectTransactionPort,
  RestorePreContractInput,
  RestorePreContractResult,
  StartTransactionInput,
  StartTransactionResult,
} from './project-transaction.port';

export type ContractServiceDeps = {
  repo: ProjectRepository;
  ports: ExternalPorts;
  now: () => string;
};

export function createProjectContractService(deps: ContractServiceDeps): ProjectTransactionPort {
  const { repo, ports, now } = deps;

  /* ─────────────── 공통 ─────────────── */

  /** 삭제된 프로젝트는 없는 것으로 본다 (규칙 11) */
  function mustFind(projectId: string) {
    const project = repo.findById(projectId);
    if (!project) {
      throw new ProjectContractError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.', {
        projectId,
      });
    }
    return project;
  }

  function conflict(message: string, details: unknown = null): never {
    throw new ProjectContractError(409, 'PROJECT_TRANSITION_CONFLICT', message, details);
  }

  /** 기대 버전이 들어 있고 현재 값과 다르면 거절한다 (규칙 45) */
  function checkVersion(envelope: ContractEnvelope, current: number): void {
    if (envelope.expectedProjectVersion === undefined) return;
    if (envelope.expectedProjectVersion !== current) {
      throw new ProjectContractError(
        409,
        'PROJECT_VERSION_CONFLICT',
        '다른 곳에서 먼저 변경되었습니다. 최신 상태를 다시 조회한 뒤 시도해 주십시오.',
        { expected: envelope.expectedProjectVersion, current },
      );
    }
  }

  /** 규칙 51 — start·complete 는 기대 버전이 없으면 422 */
  function requireExpectedVersion(envelope: ContractEnvelope): void {
    if (envelope.expectedProjectVersion === undefined) {
      throw new ProjectContractError(
        422,
        'VALIDATION_ERROR',
        'expectedProjectVersion 은 필수입니다.',
        { field: 'expectedProjectVersion' },
      );
    }
  }

  function requireField(value: string | undefined, field: string): string {
    if (!value) {
      throw new ProjectContractError(422, 'VALIDATION_ERROR', `${field} 은(는) 필수입니다.`, {
        field,
      });
    }
    return value;
  }

  /** 최초 결과를 그대로 돌려준다. 두 번째 호출이라는 것만 표시를 바꾼다 */
  function replay<T extends { alreadyProcessed: boolean }>(stored: unknown): T {
    return { ...(stored as T), alreadyProcessed: true };
  }

  /* ─────────────── 1. getProjectNegotiationContext (규칙 42) ─────────────── */

  async function getProjectNegotiationContext(projectId: string): Promise<NegotiationContext> {
    const p = mustFind(projectId);
    return {
      projectId: p.projectId,
      clientId: p.clientId,
      recruitmentStatus: p.recruitmentStatus,
      transactionStatus: p.transactionStatus,
      acceptedApplicationId: p.acceptedApplicationId,
      recruitmentDeadlineAt: p.recruitmentDeadlineAt,
      canceledAt: p.canceledAt,
      paymentPendingAt: p.paymentPendingAt,
      projectVersion: p.projectVersion,
    };
  }

  /* ─────────────── 2. acceptProjectApplication (규칙 36·55) ─────────────── */

  async function acceptProjectApplication(
    projectId: string,
    input: AcceptApplicationInput,
  ): Promise<AcceptApplicationResult> {
    requireField(input.applicationId, 'applicationId');
    const p = mustFind(projectId);

    // 규칙 55 — "같은 지원서인가"를 상태 조건보다 **먼저** 본다.
    // 순서를 바꾸면 이미 수락된 지원서로 재시도했을 때
    // "모집이 OPEN 이 아님" 409 가 나가 화면에 사실과 다른 안내가 뜬다.
    if (p.acceptedApplicationId === input.applicationId) {
      return {
        projectId: p.projectId,
        acceptedApplicationId: input.applicationId,
        recruitmentStatus: p.recruitmentStatus,
        transactionStatus: p.transactionStatus,
        alreadyProcessed: true,
        processedAt: now(),
        changed: false,
        projectVersion: p.projectVersion,
      };
    }

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<AcceptApplicationResult>(stored.result);

    // 규칙 47 — 한 프로젝트에서 수락된 지원은 최대 1건
    if (p.acceptedApplicationId !== null) {
      conflict('이미 다른 지원자가 수락되었습니다.', {
        acceptedApplicationId: p.acceptedApplicationId,
      });
    }
    if (p.recruitmentStatus !== 'OPEN' || p.transactionStatus !== 'NONE') {
      conflict('모집 중인 프로젝트만 지원을 수락할 수 있습니다.', {
        recruitmentStatus: p.recruitmentStatus,
        transactionStatus: p.transactionStatus,
      });
    }
    checkVersion(input, p.projectVersion);

    const at = now();
    const next = repo.update(projectId, {
      recruitmentStatus: 'CLOSED',
      transactionStatus: 'CONTRACT_PENDING',
      acceptedApplicationId: input.applicationId,
      recruitmentClosedAt: at,
      projectVersion: p.projectVersion + 1,
    });

    const result: AcceptApplicationResult = {
      projectId,
      acceptedApplicationId: input.applicationId,
      recruitmentStatus: next.recruitmentStatus,
      transactionStatus: next.transactionStatus,
      alreadyProcessed: false,
      processedAt: at,
      changed: true,
      projectVersion: next.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, next.projectVersion);
    return result;
  }

  /* ─────────────── 3. markPaymentPending (규칙 41) ─────────────── */

  async function markPaymentPending(
    projectId: string,
    input: MarkPaymentPendingInput,
  ): Promise<MarkPaymentPendingResult> {
    requireField(input.contractId, 'contractId');
    const p = mustFind(projectId);

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<MarkPaymentPendingResult>(stored.result);

    if (p.transactionStatus !== 'CONTRACT_PENDING' || p.canceledAt !== null) {
      conflict('계약 대기 중인 프로젝트만 결제를 시작할 수 있습니다.', {
        transactionStatus: p.transactionStatus,
      });
    }
    checkVersion(input, p.projectVersion);

    const at = now();

    // 이미 값이 있으면 **최초 시각을 그대로 둔다.**
    // 갱신하면 규칙 27 의 취소 차단 경계가 호출할 때마다 뒤로 밀린다.
    const alreadyMarked = p.paymentPendingAt !== null;
    const paymentPendingAt = p.paymentPendingAt ?? at;

    if (!alreadyMarked) {
      // 규칙 41 — 두 상태 축을 바꾸지 않으므로 projectVersion 도 올리지 않는다.
      repo.update(projectId, { paymentPendingAt });
    }

    const result: MarkPaymentPendingResult = {
      projectId,
      transactionStatus: p.transactionStatus,
      paymentPendingAt,
      alreadyProcessed: false,
      processedAt: at,
      changed: !alreadyMarked,
      projectVersion: p.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, p.projectVersion);
    return result;
  }

  /* ─────────────── 4. startProjectTransaction (규칙 37·51) ─────────────── */

  async function startProjectTransaction(
    projectId: string,
    input: StartTransactionInput,
  ): Promise<StartTransactionResult> {
    requireField(input.contractId, 'contractId');
    requireExpectedVersion(input);

    // 판정 순서: 존재 → 중복 방지 키 → 이미 IN_PROGRESS → 그 외 상태 → 버전 → 전이
    const p = mustFind(projectId);

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<StartTransactionResult>(stored.result);

    if (p.transactionStatus === 'IN_PROGRESS') {
      return {
        projectId,
        recruitmentStatus: p.recruitmentStatus,
        transactionStatus: p.transactionStatus,
        alreadyProcessed: true,
        processedAt: now(),
        changed: false,
        projectVersion: p.projectVersion,
      };
    }
    if (p.transactionStatus !== 'CONTRACT_PENDING') {
      conflict('계약 대기 중인 프로젝트만 거래를 시작할 수 있습니다.', {
        transactionStatus: p.transactionStatus,
      });
    }
    // CONTRACT_PENDING 인데 수락된 지원서가 없는 것은 정상 경로에서 생길 수 없다.
    // 여기서 막지 않으면 계약 상대가 없는 거래가 진행 중이 된다.
    if (p.acceptedApplicationId === null) {
      conflict('수락된 지원서가 없어 거래를 시작할 수 없습니다.', { acceptedApplicationId: null });
    }
    checkVersion(input, p.projectVersion);

    const at = now();
    const next = repo.update(projectId, {
      transactionStatus: 'IN_PROGRESS',
      projectVersion: p.projectVersion + 1,
    });

    const result: StartTransactionResult = {
      projectId,
      recruitmentStatus: next.recruitmentStatus,
      transactionStatus: next.transactionStatus,
      alreadyProcessed: false,
      processedAt: at,
      changed: true,
      projectVersion: next.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, next.projectVersion);
    return result;
  }

  /* ─────────────── 5. completeProjectTransaction (규칙 38·51) ─────────────── */

  async function completeProjectTransaction(
    projectId: string,
    input: CompleteTransactionInput,
  ): Promise<CompleteTransactionResult> {
    requireField(input.contractId, 'contractId');
    requireExpectedVersion(input);

    const p = mustFind(projectId);

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<CompleteTransactionResult>(stored.result);

    if (p.transactionStatus === 'COMPLETED') {
      return {
        projectId,
        recruitmentStatus: p.recruitmentStatus,
        transactionStatus: p.transactionStatus,
        alreadyProcessed: true,
        processedAt: now(),
        changed: false,
        projectVersion: p.projectVersion,
      };
    }
    // 납품·정산 테이블은 읽지 않는다. 그 두 조건은 **호출자가 지킨다** (I-30).
    // 여기서 보는 것은 IN_PROGRESS 인지 하나뿐이다.
    if (p.transactionStatus !== 'IN_PROGRESS') {
      conflict('진행 중인 거래만 완료할 수 있습니다.', {
        transactionStatus: p.transactionStatus,
      });
    }
    checkVersion(input, p.projectVersion);

    const at = now();
    const next = repo.update(projectId, {
      transactionStatus: 'COMPLETED',
      projectVersion: p.projectVersion + 1,
    });

    const result: CompleteTransactionResult = {
      projectId,
      recruitmentStatus: next.recruitmentStatus,
      transactionStatus: next.transactionStatus,
      alreadyProcessed: false,
      processedAt: at,
      changed: true,
      projectVersion: next.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, next.projectVersion);
    return result;
  }

  /* ─────────────── 6. restorePreContractProject (규칙 39·50) ─────────────── */

  async function restorePreContractProject(
    projectId: string,
    input: RestorePreContractInput,
  ): Promise<RestorePreContractResult> {
    requireField(input.negotiationId, 'negotiationId');
    const p = mustFind(projectId);

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<RestorePreContractResult>(stored.result);

    if (p.transactionStatus === 'NONE') {
      // 거래 축이 이미 NONE 인데 이 협상 키로는 처리한 적이 없다.
      // 다른 협상이 먼저 복원했다는 뜻이다.
      throw new ProjectContractError(
        409,
        'PROJECT_ALREADY_RESTORED',
        '다른 협상으로 이미 복원된 프로젝트입니다.',
        { negotiationId: input.negotiationId },
      );
    }
    if (p.transactionStatus !== 'CONTRACT_PENDING') {
      conflict('계약 대기 중인 프로젝트만 복원할 수 있습니다.', {
        transactionStatus: p.transactionStatus,
      });
    }
    checkVersion(input, p.projectVersion);

    const at = now();

    // 재개 가능 여부. 두 사유는 화면 안내가 다르다 (규칙 50).
    const deadlinePassed = new Date(p.recruitmentDeadlineAt).getTime() <= new Date(at).getTime();
    const pendingRemain = p.pendingApplicationCount > 0;

    let notReopenedReason: NotReopenedReason | null = null;
    if (pendingRemain) {
      // 대기 지원 잔존이 더 무겁다. 이 경우 A-13 재모집도 막히기 때문이다.
      notReopenedReason = 'PENDING_APPLICATIONS_REMAIN';
    } else if (deadlinePassed) {
      notReopenedReason = 'DEADLINE_PASSED';
    }
    const reopened = notReopenedReason === null;

    // recruitmentStartAt 은 건드리지 않는다. 그 값을 새로 찍는 것은 A-13 재모집뿐이다.
    // acceptedApplicationId·paymentPendingAt 을 함께 비우는 근거는
    // features/project-management/change-requests/0002 에 있다.
    const restoredFields = ['transactionStatus', 'acceptedApplicationId'];
    if (reopened) restoredFields.unshift('recruitmentStatus');
    if (p.paymentPendingAt !== null) restoredFields.push('paymentPendingAt');

    const next = repo.update(projectId, {
      recruitmentStatus: reopened ? 'OPEN' : p.recruitmentStatus,
      transactionStatus: 'NONE',
      acceptedApplicationId: null,
      paymentPendingAt: null,
      recruitmentClosedAt: reopened ? null : p.recruitmentClosedAt,
      projectVersion: p.projectVersion + 1,
    });

    const result: RestorePreContractResult = {
      projectId,
      negotiationId: input.negotiationId,
      recruitmentStatus: next.recruitmentStatus,
      transactionStatus: next.transactionStatus,
      reopened,
      notReopenedReason,
      restoredFields,
      alreadyProcessed: false,
      processedAt: at,
      changed: true,
      projectVersion: next.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, next.projectVersion);
    return result;
  }

  /* ─────────────── 7. applyPricingAnalysisBudget (규칙 40) ─────────────── */

  async function applyPricingAnalysisBudget(
    projectId: string,
    input: ApplyPricingBudgetInput,
  ): Promise<ApplyPricingBudgetResult> {
    requireField(input.pricingAnalysisId, 'pricingAnalysisId');
    const actorUserId = requireField(input.actorUserId, 'actorUserId');
    const p = mustFind(projectId);

    const stored = repo.findProcessed(input.idempotencyKey);
    if (stored) return replay<ApplyPricingBudgetResult>(stored.result);

    if (p.clientId !== actorUserId) {
      throw new ProjectContractError(403, 'PROJECT_FORBIDDEN', '본인의 프로젝트가 아닙니다.', {
        projectId,
      });
    }
    // 규칙 15 와 같은 잠금이다. 지원자가 보고 지원한 예산이 뒤에서 바뀌면 안 된다.
    if (p.pendingApplicationCount > 0) {
      throw new ProjectContractError(
        409,
        'PROJECT_EDIT_LOCKED',
        '대기 중인 지원이 있어 예산을 변경할 수 없습니다.',
        { pendingApplicationCount: p.pendingApplicationCount },
      );
    }
    checkVersion(input, p.projectVersion);

    // 호출자가 보낸 금액을 받지 않는다. 분석에 저장된 값을 읽는다 (규칙 40).
    let recommendedAmount: number;
    try {
      const found = await ports.pricing.getPricingAnalysisRecommendation({
        analysisId: input.pricingAnalysisId,
        projectId,
        requesterId: actorUserId,
      });
      recommendedAmount = found.recommendedAmount;
    } catch {
      // ai-pricing 의 실패 사유는 그쪽 도메인 코드다.
      // 이쪽 오류 코드 체계로 바꿔서 내보낸다.
      throw new ProjectContractError(
        409,
        'PRICING_ANALYSIS_NOT_APPLICABLE',
        '이 프로젝트에 반영할 수 있는 분석이 아닙니다.',
        { pricingAnalysisId: input.pricingAnalysisId },
      );
    }

    const at = now();
    // 상태 축이 아니라 예산만 바뀐다 → projectVersion 을 올리지 않는다 (규칙 44).
    repo.update(projectId, { budgetAmount: recommendedAmount });

    const result: ApplyPricingBudgetResult = {
      projectId,
      budgetAmount: recommendedAmount,
      alreadyProcessed: false,
      processedAt: at,
      changed: recommendedAmount !== p.budgetAmount,
      projectVersion: p.projectVersion,
    };
    repo.markProcessed(input.idempotencyKey, result, p.projectVersion);
    return result;
  }

  return {
    getProjectNegotiationContext,
    acceptProjectApplication,
    markPaymentPending,
    startProjectTransaction,
    completeProjectTransaction,
    restorePreContractProject,
    applyPricingAnalysisBudget,
  };
}
