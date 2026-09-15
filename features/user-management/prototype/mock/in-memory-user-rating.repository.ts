import type { UserRatingCache, UserRatingRepository, UserRatingSubject, UserRatingTransaction } from "../server/user-rating.repository";

export type InMemoryUserRatingRow = UserRatingSubject & UserRatingCache;

/** 테스트 전용. 공유 인스턴스의 사용자별 잠금이며 다중 프로세스/운영 DB 보장은 아니다. */
export class InMemoryUserRatingRepository implements UserRatingRepository {
  private readonly users = new Map<string, InMemoryUserRatingRow>();
  private readonly queues = new Map<string, Promise<void>>();
  private shouldFailCommit = false;

  constructor(seeds: readonly InMemoryUserRatingRow[] = []) {
    for (const row of seeds) this.users.set(row.userId, structuredClone(row));
  }

  getUser(userId: string): InMemoryUserRatingRow | null {
    const row = this.users.get(userId);
    return row ? structuredClone(row) : null;
  }

  failNextCommit(): void { this.shouldFailCommit = true; }

  private async serialize<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    this.queues.set(userId, gate);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (this.queues.get(userId) === gate) this.queues.delete(userId);
    }
  }

  async softDeleteUser(userId: string, deletedAt: string): Promise<void> {
    await this.serialize(userId, async () => {
      const row = this.users.get(userId);
      if (row) this.users.set(userId, { ...row, deletedAt });
    });
  }

  async withUserRatingTransaction<T>(userId: string, action: (transaction: UserRatingTransaction) => Promise<T>): Promise<T> {
    return this.serialize(userId, async () => {
      let active = true;
      let staged: UserRatingCache | undefined;
      const requireActive = () => { if (!active) throw new Error("Rating transaction closed"); };
      const transaction: UserRatingTransaction = {
        findUser: async () => {
          requireActive();
          const row = this.users.get(userId);
          return row ? { userId: row.userId, deletedAt: row.deletedAt } : null;
        },
        replaceRating: async (cache) => {
          requireActive();
          const row = this.users.get(userId);
          if (!row || row.deletedAt !== null) throw new Error("Rating user unavailable");
          staged = structuredClone(cache);
        },
      };
      try {
        const result = await action(transaction);
        if (this.shouldFailCommit) {
          this.shouldFailCommit = false;
          throw new Error("Synthetic rating commit failure");
        }
        if (staged) {
          const row = this.users.get(userId);
          if (!row || row.deletedAt !== null) throw new Error("Rating user unavailable");
          this.users.set(userId, { ...row, ...staged });
        }
        return result;
      } finally { active = false; }
    });
  }
}
