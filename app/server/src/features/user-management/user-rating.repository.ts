/** 원본: features/user-management/prototype/server/user-rating.repository.ts (오민혁, PR #89). */
export type UserRatingCache = { ratingAverage: number | null; reviewCount: number };
export type UserRatingSubject = { userId: string; deletedAt: string | null };

export type UserRatingTransaction = {
  findUser(): Promise<UserRatingSubject | null>;
  replaceRating(cache: UserRatingCache): Promise<void>;
};

export type UserRatingRepository = {
  /**
   * 사용자별 직렬화 경계. 잠금 획득 이후 callback을 시작하고, callback 안의 집계 조회부터
   * 두 캐시 필드의 원자적 commit까지 잠금을 유지한다. callback/commit 실패는 전부 rollback.
   * 운영 adapter는 모든 consumer 인스턴스/프로세스에 공통인 DB row/advisory lock을 사용하고
   * 잠금 획득 전의 오래된 snapshot/replica 집계를 재사용하지 않는다. 탈퇴도 같은 row lock 사용.
   * transaction 객체는 callback 밖으로 탈출하거나 재사용할 수 없다.
   */
  withUserRatingTransaction<T>(userId: string, action: (transaction: UserRatingTransaction) => Promise<T>): Promise<T>;
};
