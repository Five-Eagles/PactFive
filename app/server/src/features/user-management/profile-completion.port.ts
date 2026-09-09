/**
 * 원본: features/user-management/prototype/server/profile-completion.port.ts (오민혁, PR #89).
 * PRD D-58 / spec PC-01~PC-08. 서버 내부 조회 계약이며 인증을 대신하지 않는다.
 *
 * 2026-09-09 통합 범위 — RW 결정: 포트·서비스·Prisma 리포지토리만 이식하고, applications의
 * 지원 게이트(`PROFILE_INCOMPLETE`)에는 아직 주입하지 않는다. app/web에 프로필 입력·수정
 * 화면이 없어 지금 게이트를 켜면 모든 프리랜서 계정이 영원히 INCOMPLETE로 잡혀 지원 자체가
 * 막힌다(고칠 화면이 없음) — change-requests/0001-profile-completion-integration.md의
 * "통합 완료 조건"(미완성 프로필을 채울 화면)이 아직 없다. feedback_loop/2026-09-09/
 * user-management.md 참고.
 */
export type ProfileCompletionStatus = 'COMPLETE' | 'INCOMPLETE' | 'UNAVAILABLE';

export type ProfileCompletion = {
  status: ProfileCompletionStatus;
  completedAt: string | null;
  missingFields: string[];
};

export type ProfileCompletionPort = {
  getProfileCompletion(userId: string): Promise<ProfileCompletion>;
};

export type ProfileMissingField =
  | 'CLIENT_COMPANY_NAME'
  | 'CLIENT_BUSINESS_FIELD'
  | 'CLIENT_BUSINESS_FIELD_ETC'
  | 'FREELANCER_PRIMARY_CATEGORY'
  | 'FREELANCER_CAREER_YEARS'
  | 'FREELANCER_SKILLS';
