import type {
  AuthContext,
  AuthenticatedSessionResponse,
  CompleteRegistrationInput,
  CreateAuthSessionInput,
  CreateOAuthAuthorizationInput,
  CreateOAuthAuthorizationResponse,
  RegisterInput,
  RegisterResponse,
} from "../../server/auth.types";
import { validateReturnTo } from "../../shared/return-to";

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

type RefreshAuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
};

export function createRefreshCoordinator(
  refresh: (coordinationKey?: unknown) => Promise<RefreshAuthSessionResponse>,
): (coordinationKey?: unknown) => Promise<RefreshAuthSessionResponse> {
  const inFlightByKey = new Map<unknown, Promise<RefreshAuthSessionResponse>>();
  return (coordinationKey: unknown = "default") => {
    const existing = inFlightByKey.get(coordinationKey);
    if (existing) return existing;
    let pending!: Promise<RefreshAuthSessionResponse>;
    pending = refresh(coordinationKey).finally(() => {
      if (inFlightByKey.get(coordinationKey) === pending) inFlightByKey.delete(coordinationKey);
    });
    inFlightByKey.set(coordinationKey, pending);
    return pending;
  };
}

export function createAuthMutationQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function runMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = tail.then(mutation, mutation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

const enqueueAuthMutation = createAuthMutationQueue();
const activeMutationControllers = new Set<AbortController>();
const AUTH_MUTATION_TIMEOUT_MS = 15_000;
let authMutationGeneration = 0;

function authMutationCancelled(): AuthApiError {
  return new AuthApiError(409, "AUTH_FLOW_CANCELLED", "인증 흐름이 취소되었습니다.");
}

function runAuthMutation<T>(mutation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const generation = authMutationGeneration;
  return enqueueAuthMutation(async () => {
    if (generation !== authMutationGeneration) throw authMutationCancelled();
    const controller = new AbortController();
    activeMutationControllers.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AUTH_MUTATION_TIMEOUT_MS);
    try {
      return await mutation(controller.signal);
    } catch (error) {
      if (timedOut) {
        throw new AuthApiError(504, "AUTH_REQUEST_TIMEOUT", "인증 서버 응답 시간이 초과되었습니다.");
      }
      if (controller.signal.aborted) throw authMutationCancelled();
      throw error;
    } finally {
      clearTimeout(timeout);
      activeMutationControllers.delete(controller);
    }
  });
}

function cancelAuthMutations(): void {
  authMutationGeneration += 1;
  for (const controller of activeMutationControllers) controller.abort();
  activeMutationControllers.clear();
}

type RequestEmailConfirmationResponse = {
  status: "EMAIL_CONFIRMATION_REQUEST_ACCEPTED";
  message: string;
};

type JsonParser<T> = (payload: unknown) => T;

function invalidAuthResponse(): AuthApiError {
  return new AuthApiError(502, "AUTH_RESPONSE_INVALID", "인증 서버 응답을 확인할 수 없습니다.");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalidAuthResponse();
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw invalidAuthResponse();
  return value;
}

function validIsoTimestamp(value: string): string {
  if (Number.isNaN(Date.parse(value))) throw invalidAuthResponse();
  return value;
}

function parseUserSummary(payload: unknown): AuthenticatedSessionResponse["user"] {
  const user = asRecord(payload);
  const role = user.role;
  const profileImageUrl = user.profileImageUrl;
  if (role !== "CLIENT" && role !== "FREELANCER") throw invalidAuthResponse();
  if (profileImageUrl !== null && typeof profileImageUrl !== "string") throw invalidAuthResponse();
  return {
    userId: requiredString(user, "userId"),
    email: requiredString(user, "email"),
    name: requiredString(user, "name"),
    role,
    profileImageUrl,
  };
}

function parseAuthenticatedSession(payload: unknown): AuthenticatedSessionResponse {
  const session = asRecord(payload);
  const returnTo = requiredString(session, "returnTo");
  if (validateReturnTo(returnTo) !== returnTo) throw invalidAuthResponse();
  return {
    accessToken: requiredString(session, "accessToken"),
    accessTokenExpiresAt: validIsoTimestamp(requiredString(session, "accessTokenExpiresAt")),
    returnTo,
    user: parseUserSummary(session.user),
  };
}

function parseRegisterResponse(payload: unknown): RegisterResponse {
  const response = asRecord(payload);
  if (response.status !== "EMAIL_VERIFICATION_REQUIRED") throw invalidAuthResponse();
  return { status: response.status, message: requiredString(response, "message") };
}

function parseRefreshResponse(payload: unknown): RefreshAuthSessionResponse {
  const response = asRecord(payload);
  return {
    accessToken: requiredString(response, "accessToken"),
    accessTokenExpiresAt: validIsoTimestamp(requiredString(response, "accessTokenExpiresAt")),
  };
}

function parseAuthContext(payload: unknown): AuthContext {
  const context = asRecord(payload);
  if (context.authenticated !== true) throw invalidAuthResponse();
  return {
    ...parseUserSummary(context),
    authenticated: true,
    accessTokenExpiresAt: validIsoTimestamp(requiredString(context, "accessTokenExpiresAt")),
  };
}

function parseEmailConfirmationRequest(payload: unknown): RequestEmailConfirmationResponse {
  const response = asRecord(payload);
  if (response.status !== "EMAIL_CONFIRMATION_REQUEST_ACCEPTED") throw invalidAuthResponse();
  return { status: response.status, message: requiredString(response, "message") };
}

function parseOAuthAuthorization(payload: unknown): CreateOAuthAuthorizationResponse {
  const response = asRecord(payload);
  const authorizationUrl = requiredString(response, "authorizationUrl");
  let parsed: URL;
  try {
    parsed = new URL(authorizationUrl);
  } catch {
    throw invalidAuthResponse();
  }
  const localHttp = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localHttp) throw invalidAuthResponse();
  return {
    authorizationUrl,
    expiresAt: validIsoTimestamp(requiredString(response, "expiresAt")),
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers?.get?.("Retry-After");
  if (!raw) return undefined;
  const delta = Number(raw);
  if (Number.isFinite(delta) && delta >= 0) return Math.ceil(delta);
  const at = Date.parse(raw);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

const EXPECTED_ERROR_STATUSES: Readonly<Record<string, readonly number[]>> = {
  VALIDATION_ERROR: [422],
  UNSAFE_RETURN_TO: [422],
  INVALID_CREDENTIALS: [401],
  AUTH_REQUIRED: [401],
  AUTH_SESSION_INVALID: [401],
  EMAIL_VERIFICATION_REQUIRED: [403],
  REGISTRATION_RECOVERY_INVALID: [403],
  REGISTRATION_RECOVERY_EXPIRED: [410],
  REGISTRATION_NOT_AVAILABLE: [403, 409],
  EMAIL_CONFIRMATION_INVALID: [400],
  EMAIL_CONFIRMATION_EXPIRED: [410],
  EMAIL_CONFIRMATION_NOT_AVAILABLE: [403],
  AUTH_CONTEXT_CONFLICT: [409],
  REGISTRATION_COMPLETION_REQUIRED: [409],
  AUTH_RATE_LIMITED: [429],
  EMAIL_CONFIRMATION_RATE_LIMITED: [429],
  AUTH_SESSION_SYNC_FAILED: [503],
  AUTH_PROVIDER_UNAVAILABLE: [503],
  AUTH_CONFIGURATION_INVALID: [503],
  AUTH_REGISTRATION_SYNC_FAILED: [503],
  EMAIL_DELIVERY_NOT_CONFIGURED: [503],
  AUTH_PROVIDER_NOT_READY: [503],
  AUTH_LOGOUT_SYNC_FAILED: [503],
  OAUTH_CALLBACK_INVALID: [400],
  OAUTH_INTENT_INVALID: [400],
  OAUTH_ACCOUNT_NOT_AVAILABLE: [403],
  ORIGIN_NOT_ALLOWED: [403],
};

const ALLOWED_ERROR_CODES_BY_PATH: Readonly<Record<string, readonly string[]>> = {
  "/api/v1/auth/registrations": [
    "VALIDATION_ERROR", "UNSAFE_RETURN_TO", "AUTH_RATE_LIMITED", "AUTH_CONFIGURATION_INVALID",
    "AUTH_REGISTRATION_SYNC_FAILED", "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/email-confirmation-requests": [
    "VALIDATION_ERROR", "EMAIL_CONFIRMATION_RATE_LIMITED", "EMAIL_DELIVERY_NOT_CONFIGURED",
    "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/email-confirmations": [
    "EMAIL_CONFIRMATION_INVALID", "EMAIL_CONFIRMATION_EXPIRED", "EMAIL_CONFIRMATION_NOT_AVAILABLE",
    "AUTH_CONTEXT_CONFLICT", "REGISTRATION_COMPLETION_REQUIRED", "AUTH_RATE_LIMITED",
    "AUTH_SESSION_SYNC_FAILED", "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/sessions": [
    "INVALID_CREDENTIALS", "EMAIL_VERIFICATION_REQUIRED", "REGISTRATION_COMPLETION_REQUIRED",
    "AUTH_CONTEXT_CONFLICT", "REGISTRATION_NOT_AVAILABLE", "VALIDATION_ERROR", "UNSAFE_RETURN_TO",
    "AUTH_RATE_LIMITED", "AUTH_SESSION_SYNC_FAILED", "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/registration-completions": [
    "INVALID_CREDENTIALS", "EMAIL_VERIFICATION_REQUIRED", "REGISTRATION_RECOVERY_INVALID",
    "REGISTRATION_RECOVERY_EXPIRED", "REGISTRATION_NOT_AVAILABLE", "AUTH_CONTEXT_CONFLICT",
    "VALIDATION_ERROR", "UNSAFE_RETURN_TO", "AUTH_RATE_LIMITED", "AUTH_SESSION_SYNC_FAILED",
    "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/oauth-authorizations": [
    "VALIDATION_ERROR", "UNSAFE_RETURN_TO", "AUTH_CONTEXT_CONFLICT", "AUTH_PROVIDER_NOT_READY",
    "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/sessions/refresh": [
    "AUTH_SESSION_INVALID", "AUTH_SESSION_SYNC_FAILED", "AUTH_PROVIDER_UNAVAILABLE", "ORIGIN_NOT_ALLOWED",
  ],
  "/api/v1/auth/contexts/current": ["AUTH_REQUIRED", "AUTH_SESSION_INVALID"],
};

function readErrorPayload(path: string, status: number, payload: unknown): { code: string; message: string } {
  const fallback = { code: "AUTH_REQUEST_FAILED", message: "인증 요청을 완료할 수 없습니다." };
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return fallback;
  const error = (payload as Record<string, unknown>).error;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return fallback;
  const { code, message } = error as Record<string, unknown>;
  if (
    typeof code !== "string"
    || !/^[A-Z][A-Z0-9_]{2,63}$/.test(code)
    || typeof message !== "string"
    || message.trim() === ""
    || message.length > 500
  ) return fallback;
  const expectedStatuses = EXPECTED_ERROR_STATUSES[code];
  if (expectedStatuses && !expectedStatuses.includes(status)) return fallback;
  const allowedCodes = ALLOWED_ERROR_CODES_BY_PATH[path];
  if (allowedCodes && !allowedCodes.includes(code)) return fallback;
  return { code, message };
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  parse: JsonParser<T>,
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as unknown;
    const problem = readErrorPayload(path, response.status, payload);
    throw new AuthApiError(
      response.status,
      problem.code,
      problem.message,
      retryAfterSeconds(response),
    );
  }
  if (response.status !== expectedStatus) throw invalidAuthResponse();
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidAuthResponse();
  }
  return parse(payload);
}

export function createAuthSession(input: CreateAuthSessionInput): Promise<AuthenticatedSessionResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/sessions", { method: "POST", body: JSON.stringify(input), signal }, parseAuthenticatedSession),
  );
}

export function registerAccount(input: RegisterInput): Promise<RegisterResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/registrations", { method: "POST", body: JSON.stringify(input), signal }, parseRegisterResponse, 202),
  );
}

export function confirmEmail(tokenHash: string): Promise<AuthenticatedSessionResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/email-confirmations", {
      method: "POST",
      body: JSON.stringify({ tokenHash }),
      signal,
    }, parseAuthenticatedSession),
  );
}

export function completeRegistration(
  input: CompleteRegistrationInput,
): Promise<AuthenticatedSessionResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/registration-completions", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    }, parseAuthenticatedSession),
  );
}

const coordinatedRefreshAuthSession = createRefreshCoordinator(() =>
  runAuthMutation((signal) => requestJson(
    "/api/v1/auth/sessions/refresh",
    { method: "POST", body: "{}", signal },
    parseRefreshResponse,
  )),
);

export function refreshAuthSession(authFlowKey: unknown = "default"): Promise<RefreshAuthSessionResponse> {
  return coordinatedRefreshAuthSession(authFlowKey);
}

export function getCurrentAuthContext(accessToken: string): Promise<AuthContext> {
  return requestJson("/api/v1/auth/contexts/current", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  }, parseAuthContext);
}

export function requestEmailConfirmation(email: string): Promise<RequestEmailConfirmationResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/email-confirmation-requests", {
      method: "POST",
      body: JSON.stringify({ email }),
      signal,
    }, parseEmailConfirmationRequest, 202),
  );
}

export function createOAuthAuthorization(
  input: CreateOAuthAuthorizationInput,
): Promise<CreateOAuthAuthorizationResponse> {
  return runAuthMutation((signal) =>
    requestJson("/api/v1/auth/oauth-authorizations", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    }, parseOAuthAuthorization),
  );
}

export function deleteCurrentAuthSession(accessToken?: string): Promise<void> {
  cancelAuthMutations();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_MUTATION_TIMEOUT_MS);
  return fetch("/api/v1/auth/sessions/current", {
    method: "DELETE",
    credentials: "include",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    signal: controller.signal,
  }).then((response) => {
    if (!response.ok) {
      throw new AuthApiError(response.status, "LOGOUT_FAILED", "로그아웃 요청을 완료할 수 없습니다.");
    }
  }).catch((error) => {
    if (controller.signal.aborted) {
      throw new AuthApiError(504, "LOGOUT_TIMEOUT", "로그아웃 요청 시간이 초과되었습니다.");
    }
    throw error;
  }).finally(() => clearTimeout(timeout));
}

export function buildProtectedApiHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function createProtectedApiCaller(options: {
  refresh: (authFlowKey?: unknown) => Promise<RefreshAuthSessionResponse>;
  onAccessToken: (accessToken: string) => void;
  onSessionInvalid: (returnTo: string) => void;
}) {
  const refreshInFlightByKey = new Map<unknown, Promise<RefreshAuthSessionResponse>>();
  const refreshSingleFlight = (authFlowKey: unknown = "default") => {
    const existing = refreshInFlightByKey.get(authFlowKey);
    if (existing) return existing;
    let pending!: Promise<RefreshAuthSessionResponse>;
    pending = options.refresh(authFlowKey).finally(() => {
      if (refreshInFlightByKey.get(authFlowKey) === pending) refreshInFlightByKey.delete(authFlowKey);
    });
    refreshInFlightByKey.set(authFlowKey, pending);
    return pending;
  };

  return async function callProtected<T>(input: {
    accessToken: string;
    returnTo: string;
    request: (accessToken: string) => Promise<T>;
    isAuthFlowCurrent?: () => boolean;
    authFlowKey?: unknown;
  }): Promise<T> {
    const requireCurrentFlow = () => {
      if (input.isAuthFlowCurrent && !input.isAuthFlowCurrent()) {
        throw new AuthApiError(409, "AUTH_FLOW_CANCELLED", "인증 흐름이 취소되었습니다.");
      }
    };

    try {
      const result = await input.request(input.accessToken);
      requireCurrentFlow();
      return result;
    } catch (error) {
      requireCurrentFlow();
      if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
    }

    let refreshed: RefreshAuthSessionResponse;
    try {
      refreshed = await refreshSingleFlight(input.authFlowKey);
    } catch (error) {
      requireCurrentFlow();
      if (error instanceof AuthApiError && error.status === 401) options.onSessionInvalid(input.returnTo);
      throw error;
    }
    requireCurrentFlow();
    options.onAccessToken(refreshed.accessToken);

    try {
      const result = await input.request(refreshed.accessToken);
      requireCurrentFlow();
      return result;
    } catch (error) {
      requireCurrentFlow();
      if (error instanceof AuthApiError && error.status === 401) options.onSessionInvalid(input.returnTo);
      throw error;
    }
  };
}
