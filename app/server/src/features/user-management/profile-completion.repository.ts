/** 원본: features/user-management/prototype/server/profile-completion.repository.ts (오민혁, PR #89). */
export type ClientProfileCompletionRow = {
  userId: string;
  companyName: string | null;
  businessField: string | null;
  businessFieldEtc: string | null;
  completedAt: string | null;
};

export type FreelancerProfileCompletionRow = {
  userId: string;
  primaryCategory: string | null;
  careerYears: number | null;
  // 본인 freelancer_skills에 실제 연결된 기술만 조회한다. 전체 기술 카탈로그가 아니다.
  skills: readonly { skillId: string; isActive: boolean }[];
  completedAt: string | null;
};

export type ProfileCompletionSnapshot = {
  userId: string;
  deletedAt: string | null;
} & (
  | { role: 'CLIENT'; profile: ClientProfileCompletionRow | null }
  | { role: 'FREELANCER'; profile: FreelancerProfileCompletionRow | null }
);

export type ProfileCompletionRepository = {
  /**
   * PactFive users.id 기준의 일관된 읽기 snapshot. authUserId가 아니다.
   * 사용자 없음은 null; 프로필만 없으면 사용자 + profile:null을 반환한다.
   * 운영 adapter는 사용자·프로필·연결 기술을 join/transaction으로 읽고 Date를 UTC ISO로 변환한다.
   * 조회 메서드에 시각 갱신·프로필 생성 같은 쓰기 부작용을 숨기지 않는다.
   */
  findProfileCompletionSnapshot(userId: string): Promise<ProfileCompletionSnapshot | null>;
};
