/**
 * project-management 가 다른 도메인에 **제공하는** 계약 (7종)
 *
 * 원본: features/project-management/prototype/server/ports/project-transaction.port.ts (3e4977e)
 *
 * PRD §5.1 원칙 1 — "상태에는 주인이 있다. 바꾸고 싶으면 주인이 제공하는 함수를 호출한다."
 * 따라서 함수의 모양도 제공자(project-management)가 정한다.
 *
 * 계약 함수는 8종이고 그중 7종이 여기 있다. 나머지 `cancelProject` 는 의뢰인 요청이라
 * 공개 API(A-07)로 들어오며 내부 주소를 따로 열지 않는다.
 *
 * 2026-08-27 통합에서는 이 라우트를 contracts-payments 가 임시로 서빙했다
 * (`in-memory-project-transaction.adapter.ts`). 2026-08-28 통합에서 원래 설계대로
 * 이 폴더로 소유권을 되돌렸다 — feedback_loop/2026-08-28/project-management.md 항목 1.
 *
 * 브라우저 공개 API 가 아니다. 서버 간 `/internal/v1/projects/:projectId/...` 이며
 * 서비스 토큰으로만 접근한다 (spec.md 규칙 49).
 */

import type { ProjectTransactionStatus, RecruitmentStatus } from './project.types';

/* ─────────────── 공통 봉투 (PRD D-54) ─────────────── */

export type ContractEnvelope = {
  requestId: string;
  /** 같은 요청인지 판별한다. 이 값에서 ID 를 파싱하지 않는다 (규칙 43) */
  idempotencyKey: string;
  occurredAt: string;
  /** start·complete 는 필수, 나머지는 선택 (규칙 51) */
  expectedProjectVersion?: number;
  actorUserId?: string;
};

export type ContractResult = {
  /** 이전에 같은 요청이 처리됐는가 */
  alreadyProcessed: boolean;
  processedAt: string;
  /** 이번 호출로 실제로 바뀌었는가 */
  changed: boolean;
  /** 상태 축이 실제로 바뀐 경우에만 +1 (규칙 44) */
  projectVersion: number;
};

/* ─────────────── 함수별 입출력 ─────────────── */

export type NegotiationContext = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  /** 합의 대상이 실제로 수락된 지원자인지 대조하는 데 쓴다 */
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string;
  canceledAt: string | null;
  paymentPendingAt: string | null;
  projectVersion: number;
};

/** 본문에 contractId 가 필수다. 멱등 키에서 잘라 쓰지 않는다 (2026-08-25 합의) */
export type MarkPaymentPendingInput = ContractEnvelope & { contractId: string };

export type MarkPaymentPendingResult = ContractResult & {
  projectId: string;
  transactionStatus: ProjectTransactionStatus;
  /** 재호출해도 최초 값을 유지한다. 갱신하면 취소 차단 경계가 뒤로 밀린다 */
  paymentPendingAt: string;
};

export type StartTransactionInput = ContractEnvelope & {
  contractId: string;
  expectedProjectVersion: number;
};

export type StartTransactionResult = ContractResult & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
};

export type CompleteTransactionInput = ContractEnvelope & {
  contractId: string;
  expectedProjectVersion: number;
};

export type CompleteTransactionResult = ContractResult & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
};

export type AcceptApplicationInput = ContractEnvelope & {
  applicationId: string;
  actorUserId: string;
};

export type AcceptApplicationResult = ContractResult & {
  projectId: string;
  acceptedApplicationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
};

export type ApplyPricingBudgetInput = ContractEnvelope & {
  pricingAnalysisId: string;
  actorUserId: string;
};

export type ApplyPricingBudgetResult = ContractResult & {
  projectId: string;
  /** 분석에 저장된 추천 금액. 호출자가 보낸 금액은 받지 않는다 (규칙 40) */
  budgetAmount: number;
};

export type RestoreReason = 'FREELANCER_REJECTED' | 'CLIENT_REJECTED';

export type RestorePreContractInput = ContractEnvelope & {
  /** 멱등 판정 기준 */
  negotiationId: string;
  offerId?: string;
  reason: RestoreReason;
};

/** 재개하지 못한 사유. 두 경우에 화면 안내가 다르다 (규칙 50) */
export type NotReopenedReason = 'DEADLINE_PASSED' | 'PENDING_APPLICATIONS_REMAIN';

export type RestorePreContractResult = ContractResult & {
  projectId: string;
  negotiationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  reopened: boolean;
  notReopenedReason: NotReopenedReason | null;
  /**
   * 되돌린 필드 이름. `recruitmentStartAt` 은 건드리지 않는다 — 그건 A-13 재모집뿐이다.
   * `acceptedApplicationId` 와 `paymentPendingAt` 도 함께 비운다
   * (근거: features/project-management/change-requests/0002).
   */
  restoredFields: string[];
};

/* ─────────────── 포트 ─────────────── */

export interface ProjectTransactionPort {
  /** start·complete·markPaymentPending 호출 전 조회 (PRD D-44) */
  getProjectNegotiationContext(projectId: string): Promise<NegotiationContext>;

  /**
   * 지원 수락. OPEN + NONE → CLOSED + CONTRACT_PENDING (규칙 36)
   * **"같은 지원서인가"를 상태 조건보다 먼저 본다** (규칙 55).
   */
  acceptProjectApplication(
    projectId: string,
    input: AcceptApplicationInput,
  ): Promise<AcceptApplicationResult>;

  /** PG 요청 직전 1회. 상태 축을 바꾸지 않으므로 버전도 올리지 않는다 (규칙 41) */
  markPaymentPending(
    projectId: string,
    input: MarkPaymentPendingInput,
  ): Promise<MarkPaymentPendingResult>;

  /** 계약 SIGNED 그리고 결제 PAID 직후. CONTRACT_PENDING → IN_PROGRESS (규칙 37) */
  startProjectTransaction(
    projectId: string,
    input: StartTransactionInput,
  ): Promise<StartTransactionResult>;

  /**
   * 납품 APPROVED 그리고 정산 RELEASED 직후. IN_PROGRESS → COMPLETED (규칙 38)
   * 두 조건이 충족됐는지는 **호출자가 지킨다.**
   */
  completeProjectTransaction(
    projectId: string,
    input: CompleteTransactionInput,
  ): Promise<CompleteTransactionResult>;

  /** 최신 제안 수신자의 최종 거절 직후. 거래 축을 NONE 으로 되돌린다 (규칙 39) */
  restorePreContractProject(
    projectId: string,
    input: RestorePreContractInput,
  ): Promise<RestorePreContractResult>;

  /** 이미 등록된 프로젝트의 예산에 AI 추천을 반영한다 (규칙 40) */
  applyPricingAnalysisBudget(
    projectId: string,
    input: ApplyPricingBudgetInput,
  ): Promise<ApplyPricingBudgetResult>;
}

/* ─────────────── 중복 방지 키 (PRD §5.4) ─────────────── */

export const IDEMPOTENCY_KEY = {
  acceptApplication: (applicationId: string) => `application-accept-${applicationId}`,
  markPaymentPending: (contractId: string) => `payment-pending-${contractId}`,
  startTransaction: (contractId: string) => `transaction-start-${contractId}`,
  completeTransaction: (contractId: string) => `transaction-complete-${contractId}`,
  restorePreContract: (negotiationId: string) => `negotiation-reject-${negotiationId}`,
  cancelProject: (cancellationId: string) => `project-cancel-${cancellationId}`,
  applyPricingBudget: (pricingAnalysisId: string) => `pricing-apply-${pricingAnalysisId}`,
} as const;
