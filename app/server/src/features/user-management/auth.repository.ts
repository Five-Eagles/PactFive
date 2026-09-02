import type { AuthSessionRecord, RegistrationIntent, UserRecord } from "./auth.types";

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

// 가입 역할·이름·returnTo는 PactFive 애플리케이션 상태다. 공급자 app_metadata나 Admin
// listUsers 전체 순회에 숨기지 않고 앱 저장소의 명시적 CAS 경계로 분리한다.
export interface RegistrationIntentRepository {
  saveRegistrationIntent(intent: RegistrationIntent): Promise<void>;
  findRegistrationIntentByAuthUserId(authUserId: string): Promise<RegistrationIntent | null>;
  findRegistrationIntentByEmail(email: string): Promise<RegistrationIntent | null>;
  clearRegistrationIntent(authUserId: string, nonce: string): Promise<void>;
}

export type AuthRepositories = UserRepository & AuthSessionRepository & RegistrationIntentRepository;
