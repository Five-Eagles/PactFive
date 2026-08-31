/**
 * 다른 도메인에 요청하는 포트
 *
 * project-management 가 **호출하는** 쪽이다. 구현은 상대 도메인에 있다.
 * 실제 구현이 나오기 전까지는 `mock/external.mock.ts` 의 어댑터가 대신한다.
 *
 * 상대의 실제 형태가 다르면 **어댑터 한 곳만 교체한다** — 서비스 코드는 이 인터페이스만 본다.
 * 근거: ADR-0009, docs/naming-convention.md §5
 */

/* ═══════════ applications (최윤석) ═══════════ */

/** 마감·취소 사건 종류. 알림 문구가 달라서 나눈다 (spec.md 규칙 57) */
export type ClosureReason = "RECRUITMENT_CLOSED" | "PROJECT_CANCELED";

export type RejectPendingApplicationsInput = {
  /** 같은 사건에 대한 요청이 여러 번 와도 한 번만 처리하도록 하는 식별자 (PRD D-39) */
  closureEventId: string;
  reason: ClosureReason;
  occurredAt: string;
};

/** "할 일이 없었다"와 "실패했다"를 구분한다 (PRD D-89 와 같은 형태) */
export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";

export type RejectPendingApplicationsResult = {
  rejectedCount: number;
  alreadyProcessed: boolean;
  result: PostActionResult;
};

export interface ApplicationsPort {
  /**
   * 마감·취소 시 대기 지원을 일괄 거절하고 알림을 보낸다 (규칙 23·29).
   * **실패해도 마감·취소 자체는 되돌리지 않는다** (규칙 23).
   */
  rejectPendingApplications(
    projectId: string,
    input: RejectPendingApplicationsInput,
  ): Promise<RejectPendingApplicationsResult>;
}

/* ═══════════ contracts-payments (조준영) ═══════════ */

export type InvalidateAgreementInput = {
  cancellationId: string;
  actorUserId: string;
  reason: "PROJECT_CANCELED";
  projectCanceledAt: string;
};

export type InvalidateAgreementResult = {
  alreadyProcessed: boolean;
  result: PostActionResult;
};

export interface ContractsPort {
  /** 취소 시 합의·계약을 무효화한다 (규칙 29) */
  invalidateAgreementAndContract(
    projectId: string,
    input: InvalidateAgreementInput,
  ): Promise<InvalidateAgreementResult>;
}

/* ═══════════ ai-pricing (오민혁) ═══════════ */

/**
 * 등록 트랜잭션 안에서 호출한다. 이 함수는 스스로 트랜잭션을 열거나 닫지 않는다 (규칙 52).
 * 프로토타입에는 실제 트랜잭션이 없어 자리만 표시한다.
 */
export type TransactionContext = { readonly id: string };

export type ClaimPricingAnalysisInput = {
  analysisId: string;
  projectId: string;
  /** 요청자와 분석 생성자가 다르면 갱신 대상이 없어 실패한다 (규칙 53) */
  requesterId: string;
};

export type ClaimPricingAnalysisResult = {
  /** DB 에 저장된 값. 클라이언트가 보낸 금액은 쓰지 않는다 (규칙 8) */
  recommendedAmount: number;
};

export type PricingRecommendationQuery = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export interface PricingAnalysisClaimPort {
  claimPricingAnalysisForCreatedProject(
    transaction: TransactionContext,
    input: ClaimPricingAnalysisInput,
  ): Promise<ClaimPricingAnalysisResult>;

  /**
   * **⚠ 오민혁 확인 대기.** 규칙 52·53 회신에는 등록 시점의 `claim` 만 있었다.
   *
   * `applyPricingAnalysisBudget`(규칙 40)은 **이미 등록된** 프로젝트의 예산을 고친다.
   * 이때도 "분석에 저장된 추천 금액을 쓴다"이므로 저장된 값을 읽을 방법이 필요한데,
   * `claim` 은 등록 트랜잭션 전용이라 재사용할 수 없다.
   *
   * 형태가 다르면 `mock/external.mock.ts` 의 어댑터 한 곳만 고친다.
   */
  getPricingAnalysisRecommendation(
    query: PricingRecommendationQuery,
  ): Promise<ClaimPricingAnalysisResult>;
}

/* ═══════════ user-management (오민혁) ═══════════ */

export type ProfileCompletion = {
  status: "COMPLETE" | "INCOMPLETE";
  completedAt: string | null;
  /** 무엇이 비었는지. 화면에서 어느 칸인지까지 안내할 수 있다 */
  missingFields: string[];
};

export interface ProfilePort {
  /**
   * 프로필 완성 여부를 판정한다 (규칙 7 · PRD D-58).
   * **컬럼을 직접 읽지 않는다** — 완성 판정 규칙은 user-management 가 정한다.
   */
  getProfileCompletion(userId: string): Promise<ProfileCompletion>;
}

/* ═══════════ 인증 컨텍스트 ═══════════ */

export type UserRole = "CLIENT" | "FREELANCER";

/** 서버 미들웨어가 주입한다 (PRD §0.2 #1) */
export type AuthContext = { userId: string; role: UserRole };

/**
 * 개발용 고정 토큰 (규칙 54 · 오민혁 확정).
 *
 * **Mock 어댑터에서만 통한다.** 실제 인증 환경에서는 거부해야 한다.
 *
 * 값은 `server/config.ts` 의 `MOCK_LOGIN_TOKENS` 에 있다. 비밀값이 아니라
 * "이 값이면 이 사용자"라는 팀 약속이라 `.env` 로 옮기지 않았다 —
 * 팀 전체가 같은 값을 써야 서로 붙여볼 수 있다.
 */
export type MockTokenTable = Record<string, AuthContext>;

/** 모든 외부 의존을 한 묶음으로 넘긴다 — 서비스가 포트를 직접 import 하지 않게 */
export type ExternalPorts = {
  applications: ApplicationsPort;
  contracts: ContractsPort;
  pricing: PricingAnalysisClaimPort;
  profile: ProfilePort;
};
