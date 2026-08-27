import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedSessionResponse, OAuthProvider } from "../server/auth.types";
import {
  AuthApiError,
  createProtectedApiCaller,
  createAuthSession,
  createOAuthAuthorization,
  deleteCurrentAuthSession,
  getCurrentAuthContext,
  refreshAuthSession,
  requestEmailConfirmation,
} from "./api/auth";

export type AuthViewState =
  | { status: "anonymous"; message: string | null; action: null | "RESEND" | "COMPLETE_REGISTRATION" }
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
    if (error.status === 503) {
      return { status: "retryable", message: error.message, action: "RETRY" };
    }
    if (error.status === 401) clearAccessTokenInMemory();
    return { status: "anonymous", message: error.message, action: null };
  }
  return { status: "retryable", message: "잠시 후 다시 시도해 주세요.", action: "RETRY" };
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

export function useAuth() {
  const [state, setState] = useState<AuthViewState>({ status: "anonymous", message: null, action: null });

  const login = useCallback(async (input: { email: string; password: string; returnTo: string }) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      const session = await createAuthSession(input);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = session.accessToken;
      setState({ status: "authenticated", message: null, action: null, session });
      return session;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

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

  const startOAuth = useCallback(async (oauthProvider: OAuthProvider, returnTo: string) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: "submitting", message: null, action: null });
    try {
      const result = await createOAuthAuthorization({ oauthProvider, returnTo });
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
    } finally {
      clearAccessTokenInMemory();
      setState({ status: "anonymous", message: null, action: null });
    }
  }, []);

  useEffect(() => {
    void restore().catch(() => undefined);
  }, [restore]);

  return { state, login, restore, startOAuth, resendConfirmation, logout };
}
