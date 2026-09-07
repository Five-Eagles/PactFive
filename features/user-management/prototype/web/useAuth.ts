import { useCallback, useEffect, useState } from "react";
import type {
  AuthenticatedSessionResponse,
  CompleteRegistrationInput,
  OAuthProvider,
  RegisterInput,
  UserRole,
} from "../server/auth.types";
import {
  AuthApiError,
  completeRegistration as completeRegistrationRequest,
  confirmEmail as confirmEmailRequest,
  createProtectedApiCaller,
  createAuthSession,
  createOAuthAuthorization,
  deleteCurrentAuthSession,
  getCurrentAuthContext,
  refreshAuthSession,
  registerAccount,
  requestEmailConfirmation,
} from "./api/auth";

export type AuthViewState =
  | { status: "anonymous"; message: string | null; action: null | "RESEND" | "COMPLETE_REGISTRATION" | "LOGOUT" }
  | { status: "restoring"; message: null; action: null }
  | { status: "submitting"; message: null; action: null }
  | { status: "authenticated"; message: null; action: null; session: AuthenticatedSessionResponse }
  | { status: "retryable"; message: string; action: "RETRY" };

let accessTokenInMemory: string | null = null;

export function createAuthEpochGuard() {
  let epoch = 0;
  return {
    capture: () => epoch,
    advance: () => { epoch += 1; return epoch; },
    isCurrent: (captured: number) => captured === epoch,
  };
}

const authEpoch = createAuthEpochGuard();

function authFlowCancelled(): AuthApiError {
  return new AuthApiError(409, "AUTH_FLOW_CANCELLED", "인증 흐름이 취소되었습니다.");
}

const protectedApiCaller = createProtectedApiCaller({
  refresh: refreshAuthSession,
  onAccessToken: (accessToken) => { accessTokenInMemory = accessToken; },
  onSessionInvalid: (returnTo) => {
    authEpoch.advance();
    clearAccessTokenInMemory();
    if (typeof window !== "undefined") {
      window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  },
});

export function getAccessTokenInMemory(): string | null {
  return accessTokenInMemory;
}

export function clearAccessTokenInMemory(): void {
  accessTokenInMemory = null;
}

export function callProtectedApi<T>(
  returnTo: string,
  request: (accessToken: string) => Promise<T>,
): Promise<T> {
  if (!accessTokenInMemory) {
    return Promise.reject(new AuthApiError(401, "AUTH_REQUIRED", "로그인이 필요합니다."));
  }
  const capturedEpoch = authEpoch.capture();
  return protectedApiCaller({
    accessToken: accessTokenInMemory,
    returnTo,
    request,
    isAuthFlowCurrent: () => authEpoch.isCurrent(capturedEpoch),
    authFlowKey: capturedEpoch,
  });
}

export function reduceAuthFailure(error: unknown): AuthViewState {
  if (error instanceof AuthApiError) {
    if (error.code === "EMAIL_VERIFICATION_REQUIRED") {
      return { status: "anonymous", message: error.message, action: "RESEND" };
    }
    if (error.code === "REGISTRATION_COMPLETION_REQUIRED") {
      return { status: "anonymous", message: error.message, action: "COMPLETE_REGISTRATION" };
    }
    if (error.code === "AUTH_CONTEXT_CONFLICT") {
      return { status: "anonymous", message: error.message, action: "LOGOUT" };
    }
    if (error.status >= 500 && error.status <= 599) {
      return { status: "retryable", message: error.message, action: "RETRY" };
    }
    if (error.status === 401) clearAccessTokenInMemory();
    return { status: "anonymous", message: error.message, action: null };
  }
  return { status: "retryable", message: "잠시 후 다시 시도해 주세요.", action: "RETRY" };
}

export function reduceLogoutFailure(error: unknown): AuthViewState {
  return {
    status: "anonymous",
    message: error instanceof AuthApiError
      ? error.message
      : "현재 로그인 세션을 종료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    action: "LOGOUT",
  };
}

export function createSingleFlightRestorer<T>(refresh: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) inFlight = refresh().finally(() => { inFlight = null; });
    return inFlight;
  };
}

export function createEpochSingleFlightRestorer<T>(
  restore: (epoch: number) => Promise<T>,
): (epoch: number) => Promise<T> {
  let inFlight: { epoch: number; promise: Promise<T> } | null = null;
  return (epoch: number) => {
    if (inFlight?.epoch === epoch) return inFlight.promise;
    let promise!: Promise<T>;
    promise = restore(epoch).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { epoch, promise };
    return promise;
  };
}

const restoreOnce = createEpochSingleFlightRestorer(async (epoch) => {
  const refreshed = await refreshAuthSession(epoch);
  const context = await getCurrentAuthContext(refreshed.accessToken);
  return { refreshed, context };
});

export function createReturnNavigator(navigate: (path: string) => void): (path: string) => void {
  let used = false;
  return (path: string) => {
    if (used) return;
    used = true;
    navigate(path);
  };
}

export function useAuth(options: { restoreOnMount?: boolean } = {}) {
  const restoreOnMount = options.restoreOnMount ?? true;
  const [state, setState] = useState<AuthViewState>({ status: "anonymous", message: null, action: null });

  const publishSession = useCallback((capturedEpoch: number, session: AuthenticatedSessionResponse) => {
    if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
    accessTokenInMemory = session.accessToken;
    setState({ status: "authenticated", message: null, action: null, session });
    return session;
  }, []);

  const login = useCallback(async (input: { email: string; password: string; returnTo: string }) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      const session = await createAuthSession(input);
      return publishSession(capturedEpoch, session);
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, [publishSession]);

  const register = useCallback(async (input: RegisterInput) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      const response = await registerAccount(input);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      setState({ status: "anonymous", message: response.message, action: null });
      return response;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const completeRegistration = useCallback(async (input: CompleteRegistrationInput) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      return publishSession(capturedEpoch, await completeRegistrationRequest(input));
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, [publishSession]);

  const confirmEmail = useCallback(async (tokenHash: string) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      return publishSession(capturedEpoch, await confirmEmailRequest(tokenHash));
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, [publishSession]);

  const restore = useCallback(async () => {
    const capturedEpoch = authEpoch.capture();
    // 호출이 끝나기 전에는 authenticated 상태를 공개하지 않는다.
    setState({ status: "restoring", message: null, action: null });
    try {
      const { refreshed, context } = await restoreOnce(capturedEpoch);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = refreshed.accessToken;
      setState({
        status: "authenticated",
        message: null,
        action: null,
        session: {
          accessToken: refreshed.accessToken,
          accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
          returnTo: "/",
          user: context,
        },
      });
      return refreshed;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const startOAuth = useCallback(async (oauthProvider: OAuthProvider, returnTo: string, role?: UserRole) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      const result = await createOAuthAuthorization({ oauthProvider, returnTo, role });
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const capturedEpoch = authEpoch.capture();
    setState({ status: "submitting", message: null, action: null });
    try {
      const response = await requestEmailConfirmation(email);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      setState({ status: "anonymous", message: response.message, action: null });
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const accessToken = accessTokenInMemory ?? undefined;
    authEpoch.advance();
    clearAccessTokenInMemory();
    setState({ status: "anonymous", message: null, action: null });
    try {
      await deleteCurrentAuthSession(accessToken);
      setState({ status: "anonymous", message: null, action: null });
    } catch (error) {
      setState(reduceLogoutFailure(error));
      throw error;
    } finally {
      clearAccessTokenInMemory();
    }
  }, []);

  useEffect(() => {
    if (restoreOnMount) void restore().catch(() => undefined);
  }, [restore, restoreOnMount]);

  return {
    state,
    login,
    register,
    completeRegistration,
    confirmEmail,
    restore,
    startOAuth,
    resendConfirmation,
    logout,
  };
}
