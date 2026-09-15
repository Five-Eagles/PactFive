import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { UserRatingRepository, UserRatingSubject, UserRatingTransaction } from './user-rating.repository';

// $transaction 콜백 파라미터 명시 타입 — prisma-auth.repository.ts와 같은 이유
// (생성된 클라이언트가 없는 동안 sandbox network 제약으로 미검증).
type TxClient = Prisma.TransactionClient;

/**
 * UserRatingRepository의 Prisma(Supabase Postgres) 구현 — 2026-09-09, PR #89(오민혁) 후속
 * change-requests/0002. `withUserRatingTransaction`은 `pg_advisory_xact_lock`으로 사용자별
 * 잠금을 건다 — 트랜잭션 커밋/롤백 시 자동 해제되고, 같은 DB에 연결된 모든 worker
 * 프로세스/인스턴스에 공통이다(project-guard.ts의 in-process Map 잠금과 달리 서버리스
 * 다중 인스턴스에서도 유효하다 — CR-0002 "모든 worker 프로세스에 공통인 DB row/advisory lock"
 * 요구사항). 사용자 행 자체를 `SELECT ... FOR UPDATE`로 잠그지 않는 이유는 advisory lock이
 * 사용자 미존재 시에도(행이 아직 없어도) 걸 수 있는 더 일반적인 잠금이기 때문이다.
 *
 * `hashtext(userId)`는 PactFive users.id(varchar(30), 접두어 + ULID) 문자열을 32비트 정수로
 * 해시해 `pg_advisory_xact_lock(int)`에 넘긴다 — 해시 충돌 시 서로 다른 두 사용자가 같은 잠금을
 * 공유할 수 있지만(false contention), 잘못된 직렬화(다른 사용자 갱신을 건너뜀)는 발생하지
 * 않는다 — 최악의 경우 불필요하게 더 기다릴 뿐이다.
 */
export class PrismaUserRatingRepository implements UserRatingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async withUserRatingTransaction<T>(
    userId: string,
    action: (transaction: UserRatingTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const transaction: UserRatingTransaction = {
        async findUser(): Promise<UserRatingSubject | null> {
          const row = await tx.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
          if (!row) return null;
          return { userId: row.id, deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null };
        },
        async replaceRating(cache): Promise<void> {
          await tx.user.update({
            where: { id: userId },
            data: { ratingAverage: cache.ratingAverage, reviewCount: cache.reviewCount },
          });
        },
      };
      return action(transaction);
    });
  }
}
