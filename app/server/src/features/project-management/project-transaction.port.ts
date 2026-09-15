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
  /**
   * 프로젝트 제목 (CR-CP-001, 조준영/2026-09-08).
   *
   * contracts-payments가 계약 스냅샷(`project_title_snapshot`, 규칙 20)과 공개 GET
   * 4곳(`projectTitle`)을 채우는 데 쓴다. 빈 값이면 화면이 「프로젝트」로 가린다.
   */
  title: string;
  /**
   * 규칙 14 보정값 (CR-AP-003, 조준영/2026-09-08).
   *
   * **저장값이 아니라 조회 시점 기준 상태다** — `effectiveRecruitmentStatus`를 그대로
   * 돌려준다. applications 생성·수락(규칙 1·36)과 contracts-payments 협상 진입이 화면과
   * 같은 값을 보게 하기 위함이다. `SCHEDULED → OPEN` 전환 배치가 없는 이 프로젝트에서는
   * 저장값이 "아직 반영되지 않은 값"이고 이 보정값이 정본이다.
   */
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  /** 합의 대상이 실제로 수락된 지원자인지 대조하는 데 쓴다 */
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string;
  canceledAt: string | null;
  paymentPendingAt: string | null;
  /** transactionStatus가 COMPLETED로 바뀐 시각 (CR-RV-002, reviews의 review_windows.opened_at
   * 소스). COMPLETED가 아니면 항상 null이다. */
  completedAt: string | null;
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
  /**
   * 호출자가 알고 있던 현재 예산 (CR-0012).
   *
   * 화면이 "현재 예산 500만원"을 보여준 뒤 사용자가 반영을 누르기까지 사이에 예산이
   * 바뀌었으면 막는다. 버전 검사로는 못 잡는다 — 예산 변경은 `projectVersion` 을
   * 올리지 않기 때문이다(규칙 44).
   *
   * **선택값이다.** 보내지 않으면 검사하지 않는다 — 기존 호출자를 깨지 않기 위해서다.
   */
  expectedBudgetAmount?: number;
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
   * 지원 건수 갱신 (CR-AP-001).
   *
   * applications 가 **지원을 만들 때**와 **개별 거절할 때** 부른다.
   *
   *   지원 생성  `{ applicationCount: +1, pendingApplicationCount: +1 }`
   *   개별 거절  `{ pendingApplicationCount: -1 }`
   *
   * `applicationCount` 는 올라가기만 한다 — "지금까지 몇 명이 지원했나" 이므로
   * 거절해도 내려가지 않는다. 오르내리는 것은 대기 수뿐이다.
   *
   * **수락·마감·취소 때는 부르지 않는다.** 그 셋은 이 서비스가 같은 트랜잭션 안에서
   * 0 으로 놓는다(대기 지원이 전부 정리되는 시점이라 하나씩 빼는 것보다 안 어긋난다).
   * 밖에서 또 빼면 두 번 빠진다.
   *
   * 결과는 **음수가 되지 않는다** — 바닥이 0 이다. 음수는 "대기 지원 없음"으로 읽혀
   * 잠겨 있어야 할 예산이 풀린다.
   */
  bumpApplicationCounts(
    projectId: string,
    delta: { applicationCount?: number; pendingApplicationCount?: number },
  ): Promise<{ applicationCount: number; pendingApplicationCount: number }>;

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
