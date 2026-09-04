import type { AuthProvider, ProviderErrorCode } from "../server/auth.port";
import { ProviderAuthError } from "../server/auth.port";
import type {
  OAuthProvider,
  ProviderSessionCredential,
  ProviderSession,
  ProviderUser,
  VerifiedAccessSession,
} from "../server/auth.types";

type MockProviderAccount = ProviderUser & {
  password: string | null;
};

type MockSessionState = {
  current: ProviderSession;
  previousRefreshToken: string | null;
  active: boolean;
};

type QueuedOAuthCode = {
  account: MockProviderAccount;
  expectedFlowState: string;
};

export class MockAuthProvider implements AuthProvider {
  private readonly accountsByEmail = new Map<string, MockProviderAccount>();
  private readonly accountsById = new Map<string, MockProviderAccount>();
  private readonly confirmationTokens = new Map<string, string>();
  private readonly sessions = new Map<string, MockSessionState>();
  private readonly oauthCodes = new Map<string, QueuedOAuthCode>();
  private readonly calls: Array<{ name: string; detail?: string }> = [];
  private accountSequence = 100;
  private sessionSequence = 100;
  private oauthSequence = 0;
  private confirmationSequence = 0;
  private nextRefreshError: {
    code: ProviderErrorCode;
    correlation: "AUTO" | string | null;
  } | null = null;
  private nextRefreshSessionId: string | null = null;
  private nextAccessVerificationError: ProviderErrorCode | null = null;
  private signOutShouldFail = false;
  private latestProviderFlowState: string | null = null;

  seedAccount(account: MockProviderAccount): void {
    const normalized = this.normalizeEmail(account.email);
    const stored = { ...account, email: normalized };
    this.accountsByEmail.set(normalized, stored);
    this.accountsById.set(stored.authUserId, stored);
    if (!stored.emailVerified) {
      this.confirmationTokens.set(normalized, `confirm-${stored.authUserId}`);
    }
  }

  queueOAuthCode(code: string, account: MockProviderAccount, expectedFlowState: string): void {
    this.seedAccount(account);
    this.oauthCodes.set(code, { account: this.accountsById.get(account.authUserId)!, expectedFlowState });
  }

  getLatestProviderFlowState(): string {
    if (!this.latestProviderFlowState) throw new Error("OAuth authorization has not started");
    return this.latestProviderFlowState;
  }

  failNextRefresh(code: ProviderErrorCode, correlatedProviderSessionId: string | null | "AUTO" = "AUTO"): void {
    this.nextRefreshError = { code, correlation: correlatedProviderSessionId };
  }

  overrideNextRefreshProviderSessionId(providerSessionId: string): void {
    this.nextRefreshSessionId = providerSessionId;
  }

  failSignOut(value = true): void {
    this.signOutShouldFail = value;
  }

  failNextAccessVerification(code: ProviderErrorCode): void {
    this.nextAccessVerificationError = code;
  }

  getCallNames(): string[] {
    return this.calls.map((call) => call.name);
  }

  getConfirmationToken(email: string): string | null {
    return this.confirmationTokens.get(this.normalizeEmail(email)) ?? null;
  }

  hasAccount(email: string): boolean {
    return this.accountsByEmail.has(this.normalizeEmail(email));
  }

  getCurrentRefreshToken(providerSessionId: string): string | null {
    return this.sessions.get(providerSessionId)?.current.refreshToken ?? null;
  }

  expireAccessToken(accessToken: string): void {
    const state = [...this.sessions.values()].find((candidate) => candidate.current.accessToken === accessToken);
    if (state) state.current.accessTokenExpiresAt = new Date(0);
  }

  async registerEmail(input: { email: string; password: string }): Promise<{ user: ProviderUser; created: boolean }> {
    this.record("registerEmail");
    const email = this.normalizeEmail(input.email);
    let account = this.accountsByEmail.get(email);
    const created = !account;
    if (!account) {
      account = {
        authUserId: `auth_mock_${++this.accountSequence}`,
        email,
        emailVerified: false,
        password: input.password,
      };
      this.seedAccount(account);
    }
    return { user: this.toProviderUser(account), created };
  }

  async verifyPendingRegistrationOwnership(email: string, password: string): Promise<boolean> {
    this.record("verifyPendingRegistrationOwnership");
    const account = this.accountsByEmail.get(this.normalizeEmail(email));
    return Boolean(account && !account.emailVerified && account.password === password);
  }

  async deleteUnconfirmedUser(authUserId: string): Promise<void> {
    this.record("deleteUnconfirmedUser");
    const account = this.accountsById.get(authUserId);
    if (!account || account.emailVerified) return;
    this.accountsById.delete(authUserId);
    this.accountsByEmail.delete(account.email);
    this.confirmationTokens.delete(account.email);
  }

  async requestEmailConfirmation(email: string): Promise<void> {
    this.record("requestEmailConfirmation");
    const normalized = this.normalizeEmail(email);
    const account = this.accountsByEmail.get(normalized);
    if (account && !account.emailVerified) {
      this.confirmationTokens.set(
        normalized,
        `confirm-${account.authUserId}-resend-${++this.confirmationSequence}`,
      );
    }
  }

  async verifyEmail(tokenHash: string): Promise<ProviderSession> {
    this.record("verifyEmail");
    const email = [...this.confirmationTokens.entries()].find(([, token]) => token === tokenHash)?.[0];
    if (!email) throw new ProviderAuthError("INVALID_CREDENTIALS");
    const account = this.accountsByEmail.get(email)!;
    account.emailVerified = true;
    this.confirmationTokens.delete(email);
    return this.issueSession(account);
  }

  async signInWithPassword(email: string, password: string): Promise<ProviderSession> {
    this.record("signInWithPassword");
    const account = this.accountsByEmail.get(this.normalizeEmail(email));
    if (!account || account.password === null || account.password !== password) {
      throw new ProviderAuthError("INVALID_CREDENTIALS");
    }
    if (!account.emailVerified) throw new ProviderAuthError("EMAIL_NOT_CONFIRMED");
    return this.issueSession(account);
  }

  async createOAuthAuthorization(input: {
    provider: OAuthProvider;
    redirectTo: string;
  }): Promise<{ authorizationUrl: string; providerFlowState: string }> {
    this.record("createOAuthAuthorization", input.provider);
    const sequence = ++this.oauthSequence;
    const providerFlowState = `opaque-pkce-state-${sequence}`;
    this.latestProviderFlowState = providerFlowState;
    return {
      authorizationUrl: `https://provider.test/${input.provider.toLowerCase()}?state=provider-owned-${sequence}`,
      providerFlowState,
    };
  }

  async exchangeOAuthCode(code: string, providerFlowState: string): Promise<ProviderSession> {
    this.record("exchangeOAuthCode");
    const queued = this.oauthCodes.get(code);
    if (!queued || queued.expectedFlowState !== providerFlowState) {
      throw new ProviderAuthError("INVALID_CREDENTIALS");
    }
    this.oauthCodes.delete(code);
    return this.issueSession(queued.account);
  }

  async refreshSession(input: {
    refreshToken: string;
    expectedProviderSessionId: string;
  }): Promise<ProviderSession> {
    this.record("refreshSession");
    const state = [...this.sessions.values()].find(
      (candidate) =>
        candidate.active &&
        (candidate.current.refreshToken === input.refreshToken || candidate.previousRefreshToken === input.refreshToken),
    );
    if (this.nextRefreshError) {
      const { code, correlation } = this.nextRefreshError;
      this.nextRefreshError = null;
      const providerSessionId = correlation === "AUTO" ? state?.current.providerSessionId : correlation ?? undefined;
      throw new ProviderAuthError(code, code, providerSessionId);
    }
    if (!state) throw new ProviderAuthError("REFRESH_TOKEN_NOT_FOUND");
    if (state.current.providerSessionId !== input.expectedProviderSessionId) {
      throw new ProviderAuthError("INVALID_CREDENTIALS");
    }

    if (state.previousRefreshToken === input.refreshToken) {
      return { ...state.current };
    }

    const oldRefreshToken = state.current.refreshToken;
    const next = this.issueSessionTokenSet(state.current.user, state.current.providerSessionId);
    if (this.nextRefreshSessionId) {
      next.providerSessionId = this.nextRefreshSessionId;
      this.nextRefreshSessionId = null;
    }
    state.previousRefreshToken = oldRefreshToken;
    state.current = next;
    return { ...next };
  }

  async verifyAccessToken(accessToken: string): Promise<VerifiedAccessSession> {
    this.record("verifyAccessToken");
    if (this.nextAccessVerificationError) {
      const code = this.nextAccessVerificationError;
      this.nextAccessVerificationError = null;
      throw new ProviderAuthError(code);
    }
    const state = [...this.sessions.values()].find(
      (candidate) =>
        candidate.active &&
        candidate.current.accessToken === accessToken &&
        candidate.current.accessTokenExpiresAt.getTime() > Date.now(),
    );
    if (!state) throw new ProviderAuthError("INVALID_CREDENTIALS");
    const { refreshToken: _refreshToken, ...verified } = state.current;
    return { ...verified };
  }

  async revokeSession(credential: ProviderSessionCredential): Promise<void> {
    this.record("signOut", credential.providerSessionId);
    if (this.signOutShouldFail) throw new ProviderAuthError("PROVIDER_UNAVAILABLE");
    const state = this.sessions.get(credential.providerSessionId);
    if (!state || !state.active) return;
    const credentialMatches = credential.kind === "ACCESS_TOKEN"
      ? state.current.accessToken === credential.accessToken
      : state.current.refreshToken === credential.refreshToken || state.previousRefreshToken === credential.refreshToken;
    if (!credentialMatches) throw new ProviderAuthError("INVALID_CREDENTIALS");
    state.active = false;
  }

  private issueSession(account: MockProviderAccount): ProviderSession {
    const providerSessionId = `provider_session_${++this.sessionSequence}`;
    const session = this.issueSessionTokenSet(account, providerSessionId);
    this.sessions.set(providerSessionId, { current: session, previousRefreshToken: null, active: true });
    return { ...session };
  }

  private issueSessionTokenSet(account: ProviderUser, providerSessionId: string): ProviderSession {
    const tokenSequence = ++this.sessionSequence;
    return {
      accessToken: `mock-access-${tokenSequence}`,
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      refreshToken: `mock-refresh-${tokenSequence}`,
      providerSessionId,
      user: this.toProviderUser(account),
    };
  }

  private toProviderUser(account: ProviderUser): ProviderUser {
    return {
      authUserId: account.authUserId,
      email: this.normalizeEmail(account.email),
      emailVerified: account.emailVerified,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private record(name: string, detail?: string): void {
    // 토큰, 비밀번호, Authorization 원문은 call log에 절대 넣지 않는다.
    this.calls.push({ name, detail });
  }
}
