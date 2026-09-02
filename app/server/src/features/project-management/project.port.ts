/**
 * project-management 가 **호출하는** 포트 — 구현은 상대 도메인에 있다.
 *
 * 원본: features/project-management/prototype/server/ports/external.port.ts (3e4977e)
 * 상대의 실제 형태가 다르면 어댑터 한 곳만 교체한다 (ADR-0009).
 *
 * 원본에 없던 `ProjectCatalogPort` 를 팀장이 추가했다 — 카테고리·기술·의뢰인 공개 프로필의
 * 표시명은 user-management 가 정본인데(PRD D-12), 원본에서는 Mock 저장소 파일 안의 상수
 * 테이블(`prototype/mock/project.mock.ts` 의 CATEGORY_LABELS 등)로 들어가 있었다.
 * app/ 에서는 다른 도메인의 데이터를 저장소 구현 안에 숨기지 않고 포트로 드러낸다.
 * feedback_loop/2026-08-28/project-management.md 항목 2 참고.
 */

import type { CategoryRef, ClientPublicProfile, SkillRef } from './project.types';

/* ═══════════ applications ═══════════ */

/** 마감·취소 사건 종류. 알림 문구가 달라서 나눈다 (spec.md 규칙 57) */
export type ClosureReason = 'RECRUITMENT_CLOSED' | 'PROJECT_CANCELED';

export type RejectPendingApplicationsInput = {
  /** 같은 사건에 대한 요청이 여러 번 와도 한 번만 처리하도록 하는 식별자 (PRD D-39) */
  closureEventId: string;
  reason: ClosureReason;
  occurredAt: string;
};

/** "할 일이 없었다"와 "실패했다"를 구분한다 (PRD D-89 와 같은 형태) */
export type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';

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

/* ═══════════ contracts-payments ═══════════ */

export type InvalidateAgreementInput = {
  cancellationId: string;
  actorUserId: string;
  reason: 'PROJECT_CANCELED';
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

/* ═══════════ ai-pricing ═══════════ */

/**
 * 등록 트랜잭션 안에서 호출한다. 이 함수는 스스로 트랜잭션을 열거나 닫지 않는다 (규칙 52).
 * Prisma 도입 전이라 자리만 표시한다.
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

  /** 이미 등록된 프로젝트의 예산 반영(규칙 40)용. ai-pricing 확인 대기 (CR-0003) */
  getPricingAnalysisRecommendation(
    query: PricingRecommendationQuery,
  ): Promise<ClaimPricingAnalysisResult>;
}

/* ═══════════ user-management ═══════════ */

export type ProfileCompletion = {
  status: 'COMPLETE' | 'INCOMPLETE';
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

/* ═══════════ 참조 데이터 (팀장 추가) ═══════════ */

export interface ProjectCatalogPort {
  /** 카테고리 6종 중 하나인가 */
  isValidCategory(category: string): boolean;
  /** skills 테이블에 존재하는가 (공식·커스텀 모두) */
  isKnownSkill(skillId: string): boolean;
  /** is_custom = false 인가. 커스텀이 섞이면 422 (규칙 5) */
  isOfficialSkill(skillId: string): boolean;
  toCategoryRef(category: string): CategoryRef;
  toSkillRefs(skillIds: string[]): SkillRef[];
  toClientProfile(clientId: string): ClientPublicProfile;
}

/* ═══════════ 인증 컨텍스트 ═══════════ */

export type UserRole = 'CLIENT' | 'FREELANCER';

/** shared/require-auth.ts 가 주입한다 (PRD §0.2 #1) */
export type AuthContext = { userId: string; role: UserRole };

/** 모든 외부 의존을 한 묶음으로 넘긴다 — 서비스가 포트를 직접 import 하지 않게 */
export type ExternalPorts = {
  applications: ApplicationsPort;
  contracts: ContractsPort;
  pricing: PricingAnalysisClaimPort;
  profile: ProfilePort;
  catalog: ProjectCatalogPort;
};
