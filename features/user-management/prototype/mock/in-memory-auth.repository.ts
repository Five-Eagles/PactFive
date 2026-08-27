import type { AuthRepositories } from "../server/auth.repository";
import type { AuthSessionRecord, RegistrationIntent, UserRecord } from "../server/auth.types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class InMemoryAuthRepository implements AuthRepositories {
  private readonly users = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, AuthSessionRecord>();
  private readonly registrationIntents = new Map<string, RegistrationIntent>();
  private readonly consumedOAuthNonces = new Map<string, Date>();
  private failRegistrationIntentSave = false;

  failNextRegistrationIntentSave(): void {
    this.failRegistrationIntentSave = true;
  }

  seedUser(user: UserRecord): void {
    this.users.set(user.id, { ...user });
  }

  seedSession(session: AuthSessionRecord): void {
    this.sessions.set(session.id, { ...session });
  }

  getUsers(): UserRecord[] {
    return [...this.users.values()].map((user) => ({ ...user }));
  }

  getSessions(): AuthSessionRecord[] {
    return [...this.sessions.values()].map((session) => ({ ...session }));
  }

  async saveRegistrationIntent(intent: RegistrationIntent): Promise<void> {
    if (this.failRegistrationIntentSave) {
      this.failRegistrationIntentSave = false;
      throw new Error("REGISTRATION_INTENT_STORE_UNAVAILABLE");
    }
    this.registrationIntents.set(intent.authUserId, { ...intent });
  }

  async findRegistrationIntentByAuthUserId(authUserId: string): Promise<RegistrationIntent | null> {
    const intent = this.registrationIntents.get(authUserId);
    return intent ? { ...intent } : null;
  }

  async findRegistrationIntentByEmail(email: string): Promise<RegistrationIntent | null> {
    const normalized = normalizeEmail(email);
    const intent = [...this.registrationIntents.values()].find(
      (candidate) => normalizeEmail(candidate.email) === normalized,
    );
    return intent ? { ...intent } : null;
  }

  async clearRegistrationIntent(authUserId: string, nonce: string): Promise<void> {
    const current = this.registrationIntents.get(authUserId);
    if (current?.nonce === nonce) this.registrationIntents.delete(authUserId);
  }

  async findByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    const user = [...this.users.values()].find((candidate) => candidate.authUserId === authUserId);
    return user ? { ...user } : null;
  }

  async findActiveByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);
    const user = [...this.users.values()].find(
      (candidate) => normalizeEmail(candidate.email) === normalized && candidate.deletedAt === null,
    );
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);
    const user = [...this.users.values()].find((candidate) => normalizeEmail(candidate.email) === normalized);
    return user ? { ...user } : null;
  }

  async createUser(input: Omit<UserRecord, "lastLoginAt">): Promise<UserRecord> {
    const authIdConflict = [...this.users.values()].some((user) => user.authUserId === input.authUserId);
    const emailConflict = [...this.users.values()].some(
      (user) => normalizeEmail(user.email) === normalizeEmail(input.email) && user.deletedAt === null,
    );
    if (authIdConflict || emailConflict) {
      throw new Error("USER_UNIQUE_CONFLICT");
    }
    const created: UserRecord = { ...input, lastLoginAt: null };
    this.users.set(created.id, created);
    return { ...created };
  }

  async deleteUserIfUninitialized(userId: string, authUserId: string): Promise<boolean> {
    const user = this.users.get(userId);
    const hasSession = [...this.sessions.values()].some(
      (session) => session.userId === userId && session.revokedAt === null,
    );
    if (!user || user.authUserId !== authUserId || user.lastLoginAt !== null || hasSession) return false;
    this.users.delete(userId);
    return true;
  }

  async updateLastLoginAt(userId: string, at: Date): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    user.lastLoginAt = at;
  }

  async createSession(record: AuthSessionRecord): Promise<void> {
    const activeConflict = [...this.sessions.values()].some(
      (session) => session.providerSessionId === record.providerSessionId && session.revokedAt === null,
    );
    if (activeConflict) throw new Error("ACTIVE_PROVIDER_SESSION_CONFLICT");
    this.sessions.set(record.id, { ...record });
  }

  async findByRefreshFingerprint(fingerprint: string): Promise<{
    session: AuthSessionRecord;
    matched: "CURRENT" | "PREVIOUS";
  } | null> {
    for (const session of this.sessions.values()) {
      if (session.refreshTokenFingerprint === fingerprint) {
        return { session: { ...session }, matched: "CURRENT" };
      }
      if (session.previousTokenFingerprint === fingerprint) {
        return { session: { ...session }, matched: "PREVIOUS" };
      }
    }
    return null;
  }

  async findActiveByProviderSessionId(providerSessionId: string): Promise<AuthSessionRecord | null> {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.providerSessionId === providerSessionId && candidate.revokedAt === null,
    );
    return session ? { ...session } : null;
  }

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async rotateSession(input: {
    sessionId: string;
    expectedCurrentFingerprint: string;
    nextFingerprint: string;
    usedAt: Date;
  }): Promise<boolean> {
    const session = this.sessions.get(input.sessionId);
    if (
      !session ||
      session.revokedAt !== null ||
      session.refreshTokenFingerprint !== input.expectedCurrentFingerprint
    ) {
      return false;
    }
    session.previousTokenFingerprint = session.refreshTokenFingerprint;
    session.refreshTokenFingerprint = input.nextFingerprint;
    session.lastUsedAt = input.usedAt;
    return true;
  }

  async touchSession(input: {
    sessionId: string;
    expectedCurrentFingerprint: string;
    usedAt: Date;
  }): Promise<boolean> {
    const session = this.sessions.get(input.sessionId);
    if (
      !session ||
      session.revokedAt !== null ||
      session.refreshTokenFingerprint !== input.expectedCurrentFingerprint
    ) {
      return false;
    }
    session.lastUsedAt = input.usedAt;
    return true;
  }

  async revokeSession(
    sessionId: string,
    reason: NonNullable<AuthSessionRecord["revokedReason"]>,
    at: Date,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt !== null) return;
    session.revokedAt = at;
    session.revokedReason = reason;
  }

  async invalidateSession(sessionId: string, at: Date): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revokedAt !== null) return;
    session.revokedAt = at;
    // 공급자가 최종 거부했지만 reuse로 상관되지는 않은 상태다. ERD enum에 거짓 이유를 쓰지 않는다.
    session.revokedReason = null;
  }

  async consumeOAuthNonce(nonce: string, expiresAt: Date): Promise<boolean> {
    const current = this.consumedOAuthNonces.get(nonce);
    if (current) return false;
    this.consumedOAuthNonces.set(nonce, expiresAt);
    return true;
  }
}
