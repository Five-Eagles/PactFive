import type { UserRatingCache, UserRatingRepository, UserRatingSubject, UserRatingTransaction } from './user-rating.repository';

/**
 * 원본: features/user-management/prototype/mock/in-memory-user-rating.repository.ts (오민혁, PR #89).
 * mock 인증(authProviderMode === 'mock') 개발 모드용 — express-app.ts가 다른 기능과 같은
 * `isPrismaConfigured(authProviderMode)` 게이트로 이거나 PrismaUserRatingRepository를 고른다.
 * 공유 인스턴스의 사용자별 in-process 잠금이며 다중 프로세스/운영 DB 보장은 아니다
 * (change-requests/0002 "프로세스 내 Map 잠금을 그대로 운영에 복사하지 않는다" — 그래서 Prisma
 * adapter는 advisory lock을 쓴다. 이 클래스는 InMemory 개발 모드 전용).
 */
export type InMemoryUserRatingRow = UserRatingSubject & UserRatingCache;

export class InMemoryUserRatingRepository implements UserRatingRepository {
  private readonly users = new Map<string, InMemoryUserRatingRow>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(seeds: readonly InMemoryUserRatingRow[] = []) {
    for (const row of seeds) this.users.set(row.userId, { ...row });
  }

  getUser(userId: string): InMemoryUserRatingRow | null {
    const row = this.users.get(userId);
    return row ? { ...row } : null;
  }

  private async serialize<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(userId, gate);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.queues.get(userId) === gate) this.queues.delete(userId);
    }
  }

  async withUserRatingTransaction<T>(
    userId: string,
    action: (transaction: UserRatingTransaction) => Promise<T>,
  ): Promise<T> {
    return this.serialize(userId, async () => {
      let active = true;
      let staged: UserRatingCache | undefined;
      const requireActive = () => {
        if (!active) throw new Error('Rating transaction closed');
      };
      const transaction: UserRatingTransaction = {
        findUser: async () => {
          requireActive();
          const row = this.users.get(userId);
          if (row) return { userId: row.userId, deletedAt: row.deletedAt };
          // mock-auth 개발 모드에는 이 저장소가 참조할 별도의 users 레지스트리가 없다(운영
          // Prisma adapter는 실제 users 테이블을 본다). 처음 보는 사용자는 활성 사용자로 보고
          // 캐시 행을 즉석 생성한다 — dev 전용 완화이며 UserRatingSubject 계약(존재/탈퇴 여부)은
          // 유지한다.
          const created: InMemoryUserRatingRow = { userId, deletedAt: null, ratingAverage: null, reviewCount: 0 };
          this.users.set(userId, created);
          return { userId: created.userId, deletedAt: created.deletedAt };
        },
        replaceRating: async (cache) => {
          requireActive();
          const row = this.users.get(userId);
          if (!row || row.deletedAt !== null) throw new Error('Rating user unavailable');
          staged = { ...cache };
        },
      };
      try {
        const result = await action(transaction);
        if (staged) {
          const row = this.users.get(userId);
          if (!row || row.deletedAt !== null) throw new Error('Rating user unavailable');
          this.users.set(userId, { ...row, ...staged });
        }
        return result;
      } finally {
        active = false;
      }
    });
  }
}
