import type {
  AuthContext,
  AuthenticatedSessionResponse,
  CreateAuthSessionInput,
  CreateOAuthAuthorizationInput,
  CreateOAuthAuthorizationResponse,
} from "../../server/auth.types";

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
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

const runAuthMutation = createAuthMutationQueue();

type RequestEmailConfirmationResponse = {
  status: "EMAIL_CONFIRMATION_REQUEST_ACCEPTED";
  message: string;
};

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new AuthApiError(
      response.status,
      payload?.error?.code ?? "AUTH_REQUEST_FAILED",
      payload?.error?.message ?? "인증 요청을 완료할 수 없습니다.",
    );
  }
  return response.json() as Promise<T>;
}

export function createAuthSession(input: CreateAuthSessionInput): Promise<AuthenticatedSessionResponse> {
  return runAuthMutation(() =>
    requestJson("/api/v1/auth/sessions", { method: "POST", body: JSON.stringify(input) }),
  );
}

const coordinatedRefreshAuthSession = createRefreshCoordinator(() =>
  runAuthMutation(() => requestJson("/api/v1/auth/sessions/refresh", { method: "POST", body: "{}" })),
);

export function refreshAuthSession(authFlowKey: unknown = "default"): Promise<RefreshAuthSessionResponse> {
  return coordinatedRefreshAuthSession(authFlowKey);
}

export function getCurrentAuthContext(accessToken: string): Promise<AuthContext> {
  return requestJson("/api/v1/auth/contexts/current", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function requestEmailConfirmation(email: string): Promise<RequestEmailConfirmationResponse> {
  return runAuthMutation(() =>
    requestJson("/api/v1/auth/email-confirmation-requests", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  );
}

export function createOAuthAuthorization(
  input: CreateOAuthAuthorizationInput,
): Promise<CreateOAuthAuthorizationResponse> {
  return runAuthMutation(() =>
    requestJson("/api/v1/auth/oauth-authorizations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function deleteCurrentAuthSession(accessToken?: string): Promise<void> {
  return runAuthMutation(async () => {
    const response = await fetch("/api/v1/auth/sessions/current", {
      method: "DELETE",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    if (!response.ok && response.status !== 204) {
      throw new AuthApiError(response.status, "LOGOUT_FAILED", "로그아웃 요청을 완료할 수 없습니다.");
    }
  });
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
