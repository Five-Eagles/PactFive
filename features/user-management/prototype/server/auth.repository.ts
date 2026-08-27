import type { AuthSessionRecord, UserRecord } from "./auth.types";

export interface UserRepository {
  findByAuthUserId(authUserId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findActiveByEmail(email: string): Promise<UserRecord | null>;
  createUser(input: Omit<UserRecord, "lastLoginAt">): Promise<UserRecord>;
  deleteUserIfUninitialized(userId: string, authUserId: string): Promise<boolean>;
  updateLastLoginAt(userId: string, at: Date): Promise<void>;
}

export interface AuthSessionRepository {
  createSession(record: AuthSessionRecord): Promise<void>;
  findByRefreshFingerprint(fingerprint: string): Promise<{
    session: AuthSessionRecord;
    matched: "CURRENT" | "PREVIOUS";
  } | null>;
  findActiveByProviderSessionId(providerSessionId: string): Promise<AuthSessionRecord | null>;
  findSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
  rotateSession(input: {
    sessionId: string;
    expectedCurrentFingerprint: string;
    nextFingerprint: string;
    usedAt: Date;
  }): Promise<boolean>;
  touchSession(input: {
    sessionId: string;
    expectedCurrentFingerprint: string;
    usedAt: Date;
  }): Promise<boolean>;
  revokeSession(
    sessionId: string,
    reason: NonNullable<AuthSessionRecord["revokedReason"]>,
    at: Date,
  ): Promise<void>;
  invalidateSession(sessionId: string, at: Date): Promise<void>;
  consumeOAuthNonce(nonce: string, expiresAt: Date): Promise<boolean>;
}

export type AuthRepositories = UserRepository & AuthSessionRepository;
