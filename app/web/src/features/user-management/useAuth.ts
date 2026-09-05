import { useCallback, useEffect, useState } from 'react';
import { ApiError, setAuthTokenProvider } from '../../shared/http';
import type {
  AuthenticatedSessionResponse,
  CompleteRegistrationInput,
  OAuthProvider,
  RegisterInput,
  UserRole,
} from './auth.types';
import {
  completeRegistration as completeRegistrationRequest,
  confirmEmail as confirmEmailRequest,
  createAuthSession,
  createOAuthAuthorization,
  deleteCurrentAuthSession,
  getCurrentAuthContext,
  refreshAuthSession,
  registerAccount,
  requestEmailConfirmation,
} from './api/auth';

/**
 * user-management 인증 상태 훅 — 원본(`features/user-management/prototype/web/useAuth.ts`)의
 * 상태 기계·epoch 가드·single-flight refresh 로직을 그대로 옮기고, 토큰 저장소만
 * `shared/http.ts`의 `setAuthTokenProvider`에 연결하도록 재해석했다. 이렇게 하면 다른 기능의
 * `api/{도메인}.ts`가 보호 API를 호출할 때도 이 훅이 관리하는 accessToken을 자동으로 쓴다.
 */
export type AuthViewState =
  | {
      status: 'anonymous';
      message: string | null;
      action: null | 'RESEND' | 'COMPLETE_REGISTRATION' | 'LOGOUT';
    }
  | { status: 'restoring'; message: null; action: null }
  | { status: 'submitting'; message: null; action: null }
  | { status: 'authenticated'; message: null; action: null; session: AuthenticatedSessionResponse }
  | { status: 'retryable'; message: string; action: 'RETRY' };

let accessTokenInMemory: string | null = null;

// shared/http.ts가 다른 기능의 보호 API 호출에도 이 값을 쓸 수 있게 앱 시작 시 한 번 등록한다.
setAuthTokenProvider(() => accessTokenInMemory);

export function getAccessTokenInMemory(): string | null {
  return accessTokenInMemory;
}

export function clearAccessTokenInMemory(): void {
  accessTokenInMemory = null;
}

function createAuthEpochGuard() {
  let epoch = 0;
  return {
    capture: () => epoch,
    advance: () => {
      epoch += 1;
      return epoch;
    },
    isCurrent: (captured: number) => captured === epoch,
  };
}

const authEpoch = createAuthEpochGuard();

function authFlowCancelled(): ApiError {
  return new ApiError(409, '인증 흐름이 취소되었습니다.', undefined, 'AUTH_FLOW_CANCELLED');
}

function createEpochSingleFlightRestorer<T>(restore: (epoch: number) => Promise<T>): (epoch: number) => Promise<T> {
  let inFlight: { epoch: number; promise: Promise<T> } | null = null;
  return (epoch: number) => {
    if (inFlight?.epoch === epoch) return inFlight.promise;
    const promise = restore(epoch).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { epoch, promise };
    return promise;
  };
}

// refreshAuthSession(api/auth.ts) 자체도 single-flight이지만, 세션 복원 흐름은 refresh 뒤
// getCurrentAuthContext까지 한 묶음으로 취소 가능해야 하므로 한 번 더 감싼다.
const restoreOnce = createEpochSingleFlightRestorer(async (epoch) => {
  const refreshed = await refreshAuthSession(epoch);
  const context = await getCurrentAuthContext(refreshed.accessToken);
  return { refreshed, context };
});

export function reduceAuthFailure(error: unknown): AuthViewState {
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
      return { status: 'anonymous', message: error.message, action: 'RESEND' };
    }
    if (error.code === 'REGISTRATION_COMPLETION_REQUIRED') {
      return { status: 'anonymous', message: error.message, action: 'COMPLETE_REGISTRATION' };
    }
    // 2026-09-05 — 가입/가입 복구 도중 이미 다른 계정으로 로그인돼 있는 충돌.
    // 원본(prototype useAuth.ts)의 action: "LOGOUT" 분기를 그대로 옮겼다.
    if (error.code === 'AUTH_CONTEXT_CONFLICT') {
      return { status: 'anonymous', message: error.message, action: 'LOGOUT' };
    }
    if (error.status >= 500 && error.status <= 599) {
      return { status: 'retryable', message: error.message, action: 'RETRY' };
    }
    if (error.status === 401) clearAccessTokenInMemory();
    return { status: 'anonymous', message: error.message, action: null };
  }
  return { status: 'retryable', message: '잠시 후 다시 시도해 주세요.', action: 'RETRY' };
}

/** 인증 성공 후 원래 화면으로 딱 한 번만 이동한다 (spec.md 규칙 19 "원래 화면 복귀"). */
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
  const [state, setState] = useState<AuthViewState>({ status: 'anonymous', message: null, action: null });

  const login = useCallback(async (input: { email: string; password: string; returnTo: string }) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: 'submitting', message: null, action: null });
    try {
      const session = await createAuthSession(input);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = session.accessToken;
      setState({ status: 'authenticated', message: null, action: null, session });
      return session;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const restore = useCallback(async () => {
    const capturedEpoch = authEpoch.capture();
    // 호출이 끝나기 전에는 authenticated 상태를 공개하지 않는다 (spec.md 규칙 14).
    setState({ status: 'restoring', message: null, action: null });
    try {
      const { refreshed, context } = await restoreOnce(capturedEpoch);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = refreshed.accessToken;
      setState({
        status: 'authenticated',
        message: null,
        action: null,
        session: {
          accessToken: refreshed.accessToken,
          accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
          returnTo: '/',
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

  // 2026-09-05 — 회원가입도 소셜로 시작할 수 있어 role을 선택적으로 함께 보낸다
  // (원본 prototype useAuth.ts와 동일, `CreateOAuthAuthorizationInput.role`은 이미 있었다).
  const startOAuth = useCallback(async (oauthProvider: OAuthProvider, returnTo: string, role?: UserRole) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: 'submitting', message: null, action: null });
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

  // 2026-09-05 — 회원가입 3종. 원본(prototype useAuth.ts)의 register/completeRegistration/
  // confirmEmail을 그대로 옮겼다. register는 세션을 만들지 않는다(이메일 확인 대기) — 성공하면
  // anonymous로 돌아가되 서버가 준 안내 문구만 message에 싣는다.
  const register = useCallback(async (input: RegisterInput) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: 'submitting', message: null, action: null });
    try {
      const response = await registerAccount(input);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      setState({ status: 'anonymous', message: response.message, action: null });
      return response;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const completeRegistration = useCallback(async (input: CompleteRegistrationInput) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: 'submitting', message: null, action: null });
    try {
      const session = await completeRegistrationRequest(input);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = session.accessToken;
      setState({ status: 'authenticated', message: null, action: null, session });
      return session;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const confirmEmail = useCallback(async (tokenHash: string) => {
    const capturedEpoch = authEpoch.advance();
    setState({ status: 'submitting', message: null, action: null });
    try {
      const session = await confirmEmailRequest(tokenHash);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      accessTokenInMemory = session.accessToken;
      setState({ status: 'authenticated', message: null, action: null, session });
      return session;
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const capturedEpoch = authEpoch.capture();
    setState({ status: 'submitting', message: null, action: null });
    try {
      const response = await requestEmailConfirmation(email);
      if (!authEpoch.isCurrent(capturedEpoch)) throw authFlowCancelled();
      setState({ status: 'anonymous', message: response.message, action: null });
    } catch (error) {
      if (!authEpoch.isCurrent(capturedEpoch)) throw error;
      setState(reduceAuthFailure(error));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    authEpoch.advance();
    clearAccessTokenInMemory();
    setState({ status: 'anonymous', message: null, action: null });
    try {
      await deleteCurrentAuthSession();
    } finally {
      clearAccessTokenInMemory();
      setState({ status: 'anonymous', message: null, action: null });
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
