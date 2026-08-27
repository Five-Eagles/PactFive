/**
 * project-transaction.port — project-management 가 다른 도메인에 제공하는 계약
 *
 * ## 이 파일이 여기 있는 이유
 *
 * 이 함수들은 `projects` 의 상태를 바꾼다. PRD §5.1 원칙 1 —
 * "상태에는 주인이 있다. 바꾸고 싶으면 주인이 제공하는 함수를 호출한다."
 * 따라서 **함수의 모양도 제공자(project-management)가 정한다.**
 *
 * 계약 함수는 8종이고, 그중 7종이 여기 있다. 나머지 하나 `cancelProject` 는
 * 의뢰인 요청이라 공개 API(A-07)로 들어오며 내부 주소를 따로 열지 않는다.
 *
 * contracts-payments 가 2026-08-26 에 같은 형태의 Mock 스탠드인을
 * `features/contracts-payments/prototype/` 에 만들어 두었다. 제 구현이 없던 동안
 * 호출부를 붙이기 위한 임시 조치였고, 필드는 이 파일과 동일하다.
 * **이 구현이 올라간 뒤에는 그쪽이 이 포트를 import 한다.**
 *
 * ## 부르는 방법
 *
 * 브라우저 공개 API 가 아니다. 서버 간 `/internal/v1/projects/:projectId/...` 이며
 * 서비스 토큰으로만 접근한다 (spec.md 규칙 49). 사용자 로그인 토큰은 거부한다.
 *
 * 함수명이 정본이고 REST 경로는 구현 편의다 (PRD D-48).
 */

import type { ProjectTransactionStatus, RecruitmentStatus } from "../project.types";

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

export type RestoreReason = "FREELANCER_REJECTED" | "CLIENT_REJECTED";

export type RestorePreContractInput = ContractEnvelope & {
  /** 멱등 판정 기준 */
  negotiationId: string;
  offerId?: string;
  reason: RestoreReason;
};

/** 재개하지 못한 사유. 두 경우에 화면 안내가 다르다 (규칙 50) */
export type NotReopenedReason = "DEADLINE_PASSED" | "PENDING_APPLICATIONS_REMAIN";

export type RestorePreContractResult = ContractResult & {
  projectId: string;
  negotiationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  reopened: boolean;
  notReopenedReason: NotReopenedReason | null;
  /**
   * 되돌린 필드 이름. `recruitmentStartAt` 은 건드리지 않는다 — 그건 A-13 재모집뿐이다.
   *
   * **`acceptedApplicationId` 와 `paymentPendingAt` 도 함께 비운다.**
   * 계약 문서의 응답 예시에는 두 개만 적혀 있으나, 남겨두면 조용히 막히는 곳이 생긴다 —
   * 수락 지원서가 남으면 규칙 47 때문에 다른 지원자를 수락할 수 없고,
   * 결제 시작 시각이 남으면 규칙 27 때문에 취소가 영영 막힌다.
   * change-requests/0002 에 근거를 적었고 contracts-payments 확인 대기 중이다.
   */
  restoredFields: string[];
};

/* ─────────────── 포트 ─────────────── */

export interface ProjectTransactionPort {
  /** start·complete·markPaymentPending 호출 전 조회 (PRD D-44) */
  getProjectNegotiationContext(projectId: string): Promise<NegotiationContext>;

  /**
   * 지원 수락. OPEN + NONE → CLOSED + CONTRACT_PENDING (규칙 36)
   *
   * **"같은 지원서인가"를 상태 조건보다 먼저 본다** (규칙 55).
   * 순서가 반대면 정상 재시도가 409 를 받고 화면에 사실과 다른 안내가 뜬다.
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
   *
   * 두 조건이 충족됐는지는 **호출자가 지킨다.** 이 도메인은 IN_PROGRESS 인지만 본다 —
   * deliveries·payments 는 contracts-payments 테이블이라 읽지 않는다.
   * I-30 의 테스트는 그쪽에 있어야 한다.
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

  /**
   * 이미 등록된 프로젝트의 예산에 AI 추천을 반영한다 (규칙 40).
   *
   * 등록 시점의 연결은 이 함수가 아니라 `POST /api/v1/projects` 의 `pricingAnalysisId`
   * 필드로 처리한다. 두 경로를 헷갈리면 등록 트랜잭션이 두 번 돈다.
   */
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

/** 서버 간 호출에 붙는 헤더. 사용자 로그인 토큰으로는 접근할 수 없다 (규칙 49) */
export const INTERNAL_SERVICE_TOKEN = "mock-internal-service-token";
