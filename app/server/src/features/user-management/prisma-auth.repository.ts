import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type {
  User as UserRow,
  AuthSession as AuthSessionRow,
  RegistrationIntent as RegistrationIntentRow,
} from '../../generated/prisma/client';

// $transaction 콜백 파라미터 명시 타입 — 생성된 클라이언트가 없는 동안(sandbox network
// 제약으로 미검증) tsc가 이 타입을 추론 못 해 `tx: any`로 새는 걸 막는다.
type TxClient = Prisma.TransactionClient;
import type { AuthRepositories } from './auth.repository';
import type { AuthSessionRecord, RegistrationIntent, UserRecord } from './auth.types';

/**
 * AuthRepositories의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-07, 물리 마이그레이션 + 어댑터 교체 트랙(팀장 작업) — InMemoryAuthRepository와
 * 동작을 최대한 동일하게 맞추되, 두 지점은 의도적으로 다르다:
 *
 *   1. `createUser`/`createSession`의 충돌 검사를 `$transaction`으로 감쌌다 — 인메모리는
 *      단일 프로세스라 경쟁 조건이 없었지만, 실제 DB는 동시 요청이 진짜로 겹칠 수 있다.
 *   2. `rotateSession`/`touchSession`은 in-memory처럼 "조회 후 조건 검사 후 수정"이 아니라
 *      `updateMany`의 `where` 절에 조건을 전부 넣어 원자적 compare-and-swap으로 만들었다 —
 *      더 안전하다(in-memory보다 개선된 지점).
 *
 * 알려진 차이(발견 시 팀 논의 필요, 지금은 막지 않음):
 *   - `deleteUserIfUninitialized`: auth_sessions.user_id가 User FK라 이력 세션(revoked
 *     포함)이 하나라도 있으면 DB가 삭제를 막을 수 있다 — in-memory는 이 제약이 없었다.
 *   - email 대소문자 무관 비교는 Prisma `mode: 'insensitive'`로 대체했다 — DB 컬레이션에
 *     따라 인덱스를 못 타 느릴 수 있다(지금 트래픽 규모에서는 무관).
 */
export class PrismaAuthRepository implements AuthRepositories {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------
  // RegistrationIntentRepository
  // ---------------------------------------------------------------------

  async saveRegistrationIntent(intent: RegistrationIntent): Promise<void> {
    await this.prisma.registrationIntent.upsert({
      where: { authUserId: intent.authUserId },
      create: intent,
      update: intent,
    });
  }

  async findRegistrationIntentByAuthUserId(authUserId: string): Promise<RegistrationIntent | null> {
    const row = await this.prisma.registrationIntent.findUnique({ where: { authUserId } });
    return row ? mapRegistrationIntent(row) : null;
  }

  async findRegistrationIntentByEmail(email: string): Promise<RegistrationIntent | null> {
    const row = await this.prisma.registrationIntent.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    return row ? mapRegistrationIntent(row) : null;
  }

  async clearRegistrationIntent(authUserId: string, nonce: string): Promise<void> {
    await this.prisma.registrationIntent.deleteMany({ where: { authUserId, nonce } });
  }

  // ---------------------------------------------------------------------
  // UserRepository
  // ---------------------------------------------------------------------

  async findByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { authUserId } });
    return row ? mapUser(row) : null;
  }

  async findActiveByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' }, deletedAt: null },
    });
    return row ? mapUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    return row ? mapUser(row) : null;
  }

  async createUser(input: Omit<UserRecord, 'lastLoginAt'>): Promise<UserRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const conflict = await tx.user.findFirst({
        where: {
          OR: [
            { authUserId: input.authUserId },
            { email: { equals: input.email.trim(), mode: 'insensitive' }, deletedAt: null },
          ],
        },
      });
      if (conflict) throw new Error('USER_UNIQUE_CONFLICT');
      const created = await tx.user.create({
        data: {
          id: input.id,
          authUserId: input.authUserId,
          email: input.email,
          name: input.name,
          role: input.role,
          profileImageUrl: input.profileImageUrl,
          deletedAt: input.deletedAt,
        },
      });
      return mapUser(created);
    });
  }

  async deleteUserIfUninitialized(userId: string, authUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.authUserId !== authUserId || user.lastLoginAt !== null) return false;
      const activeSession = await tx.authSession.findFirst({ where: { userId, revokedAt: null } });
      if (activeSession) return false;
      // 이력 세션(revoked)이 하나라도 남아 있으면 FK 때문에 여기서 예외가 날 수 있다 —
      // 클래스 상단 주석 "알려진 차이" 참고. 지금은 잡지 않고 그대로 올려보낸다.
      await tx.user.delete({ where: { id: userId } });
      return true;
    });
  }

  async updateLastLoginAt(userId: string, at: Date): Promise<void> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: at } });
    } catch {
      throw new Error('USER_NOT_FOUND');
    }
  }

  // ---------------------------------------------------------------------
  // AuthSessionRepository
  // ---------------------------------------------------------------------

  async createSession(record: AuthSessionRecord): Promise<void> {
    await this.prisma.$transaction(async (tx: TxClient) => {
      const conflict = await tx.authSession.findFirst({
        where: { providerSessionId: record.providerSessionId, revokedAt: null },
      });
      if (conflict) throw new Error('ACTIVE_PROVIDER_SESSION_CONFLICT');
      await tx.authSession.create({
        data: {
          id: record.id,
          userId: record.userId,
          providerSessionId: record.providerSessionId,
          refreshTokenHash: record.refreshTokenFingerprint,
          previousTokenHash: record.previousTokenFingerprint,
          deviceLabel: record.deviceLabel,
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          lastUsedAt: record.lastUsedAt,
          revokedAt: record.revokedAt,
          revokedReason: record.revokedReason,
        },
      });
    });
  }

  async findByRefreshFingerprint(
    fingerprint: string,
  ): Promise<{ session: AuthSessionRecord; matched: 'CURRENT' | 'PREVIOUS' } | null> {
    const current = await this.prisma.authSession.findFirst({ where: { refreshTokenHash: fingerprint } });
    if (current) return { session: mapSession(current), matched: 'CURRENT' };
    const previous = await this.prisma.authSession.findFirst({ where: { previousTokenHash: fingerprint } });
    if (previous) return { session: mapSession(previous), matched: 'PREVIOUS' };
    return null;
  }

  async findActiveByProviderSessionId(providerSessionId: string): Promise<AuthSessionRecord | null> {
    const row = await this.prisma.authSession.findFirst({ where: { providerSessionId, revokedAt: null } });
    return row ? mapSession(row) : null;
  }

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const row = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    return row ? mapSession(row) : null;
  }

  async rotateSession(input: {
    sessionId: string;
    expectedCurrentFingerprint: string;
    nextFingerprint: string;
    usedAt: Date;
  }): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: input.sessionId, revokedAt: null, refreshTokenHash: input.expectedCurrentFingerprint },
      data: {
        previousTokenHash: input.expectedCurrentFingerprint,
        refreshTokenHash: input.nextFingerprint,
        lastUsedAt: input.usedAt,
      },
    });
    return result.count > 0;
  }

  async touchSession(input: { sessionId: string; expectedCurrentFingerprint: string; usedAt: Date }): Promise<boolean> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: input.sessionId, revokedAt: null, refreshTokenHash: input.expectedCurrentFingerprint },
      data: { lastUsedAt: input.usedAt },
    });
    return result.count > 0;
  }

  async revokeSession(
    sessionId: string,
    reason: NonNullable<AuthSessionRecord['revokedReason']>,
    at: Date,
  ): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
  }

  async invalidateSession(sessionId: string, at: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: at, revokedReason: null },
    });
  }

  async consumeOAuthNonce(nonce: string, expiresAt: Date): Promise<boolean> {
    try {
      await this.prisma.oAuthNonce.create({ data: { nonce, expiresAt } });
      return true;
    } catch {
      // PK(nonce) 충돌 = 이미 소비된 nonce. InMemoryAuthRepository의 "이미 있으면 false"와
      // 동일한 의미다 — 어떤 이유로든 insert가 실패하면 안전 측으로 "소비 실패"로 본다.
      return false;
    }
  }
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    authUserId: row.authUserId,
    email: row.email,
    name: row.name,
    role: row.role,
    profileImageUrl: row.profileImageUrl,
    deletedAt: row.deletedAt,
    lastLoginAt: row.lastLoginAt,
  };
}

function mapSession(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    providerSessionId: row.providerSessionId,
    refreshTokenFingerprint: row.refreshTokenHash,
    previousTokenFingerprint: row.previousTokenHash,
    deviceLabel: row.deviceLabel,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    // 스키마상 nullable이지만(PRISMA-GAP-7 주석) 우리 쓰기 경로는 항상 채운다 —
    // 방어적으로만 issuedAt을 대체값으로 둔다.
    lastUsedAt: row.lastUsedAt ?? row.issuedAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
  };
}

function mapRegistrationIntent(row: RegistrationIntentRow): RegistrationIntent {
  return {
    authUserId: row.authUserId,
    email: row.email,
    name: row.name,
    role: row.role,
    returnTo: row.returnTo,
    nonce: row.nonce,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    recoveryExpiresAt: row.recoveryExpiresAt,
  };
}
