import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
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

// --- 로컬 개발 전용 mock 로그인 토글 (2026-09-07) ---------------------------------------
//
// 로컬 `npm run dev`는 app/server의 `AUTH_PROVIDER_MODE`가 기본값으로 `mock`이고(그 모드의
// `requireAuth`는 `app/server/src/features/user-management/auth.mock.ts`가 정의한 고정 토큰
// 두 개만 인정한다), 실제 로그인 화면을 통과해도 거기서 발급되는 토큰(`mock-access-N`)은 이
// 고정 토큰과 다르므로 보호된 API가 여전히 401을 낸다 — 로그인 화면 자체가 로컬 테스트에
// 쓸모가 없다는 뜻이다. 그래서 화면 전환 없이 이 고정 토큰으로 바로 갈아 끼우는 토글을 뒀다.
//
// 아래 두 값(토큰·userId)은 auth.mock.ts를 그대로 미러링한 것이다 — 서버 쪽 값이 바뀌면
// 여기도 같이 고쳐야 한다(app/web은 app/server를 import하지 않으므로 자동으로 안 맞춰진다,
// contract.types.ts가 public-api.types.ts를 그대로 미러링하는 것과 같은 이유·같은 위험).
//
// 프로덕션 빌드에서는 죽는다 — `import.meta.env.DEV`는 Vite가 빌드 시점에 상수로 치환해
// 죽은 코드로 접히므로, `DevAuthToggle`을 렌더하는 조건문(App.tsx)과 함께 번들에서 빠진다.
export type DevMockRole = 'CLIENT' | 'FREELANCER';

export const DEV_MOCK_AUTH_ENABLED = import.meta.env.DEV;

const DEV_MOCK_SESSIONS: Record<DevMockRole, AuthenticatedSessionResponse> = {
  CLIENT: {
    accessToken: 'pactfive-mock-client-01',
    accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    returnTo: '/',
    user: {
      userId: 'usr_00000000000000000000000001',
      email: 'mock-client@pactfive.test',
      name: '(mock) 의뢰인',
      role: 'CLIENT',
      profileImageUrl: null,
    },
  },
  FREELANCER: {
    accessToken: 'pactfive-mock-freelancer-01',
    accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    returnTo: '/',
    user: {
      userId: 'usr_00000000000000000000000002',
      email: 'mock-freelancer@pactfive.test',
      name: '(mock) 프리랜서',
      role: 'FREELANCER',
      profileImageUrl: null,
    },
  },
};

/** 이 accessToken이 mock 토글이 발급한 것인지 — 실제 로그인과 구분해 배지 문구를 고를 때 쓴다. */
export function devMockRoleForToken(accessToken: string | null): DevMockRole | null {
  if (accessToken === DEV_MOCK_SESSIONS.CLIENT.accessToken) return 'CLIENT';
  if (accessToken === DEV_MOCK_SESSIONS.FREELANCER.accessToken) return 'FREELANCER';
  return null;
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

function useAuthController(options: { restoreOnMount?: boolean } = {}) {
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

  /**
   * 로컬 mock 토글 전용 — 실제 로그인 화면을 거치지 않고 바로 authenticated 상태로
   * 전환한다. 네트워크 호출이 없으므로 `authService`가 없어도(Supabase 미설정) 동작한다.
   * `DEV_MOCK_AUTH_ENABLED`가 false면(프로덕션 빌드) 아무 일도 하지 않는다 — 방어적으로
   * 한 번 더 막아 둔다(App.tsx가 토글 자체를 안 그리는 것과 별개의 두 번째 방어선).
   */
  const devLoginAsMock = useCallback((role: DevMockRole) => {
    if (!DEV_MOCK_AUTH_ENABLED) return;
    authEpoch.advance(); // 진행 중이던 실제 로그인/복원 흐름은 취소된 걸로 친다.
    const session = DEV_MOCK_SESSIONS[role];
    accessTokenInMemory = session.accessToken;
    setState({ status: 'authenticated', message: null, action: null, session });
  }, []);

  /**
   * mock 세션을 끈다. 실제 `logout()`과 달리 서버에 `DELETE`를 보내지 않는다 — mock
   * 토큰은 서버가 세션으로 알지 못하는 고정 문자열이라 그 호출은 401만 돌려주고,
   * `shared/http.ts`의 `onUnauthorized`(로그인 화면 이동)까지 잘못 튀길 뿐이다.
   */
  const devLogoutMock = useCallback(() => {
    if (!DEV_MOCK_AUTH_ENABLED) return;
    authEpoch.advance();
    clearAccessTokenInMemory();
    setState({ status: 'anonymous', message: null, action: null });
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
    devLoginAsMock,
    devLogoutMock,
  };
}

type AuthContextValue = ReturnType<typeof useAuthController>;

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 앱 전체가 하나의 인증 상태를 공유하도록 하는 전역 경계.
 *
 * 로그인 화면과 AppRoutes가 각각 useAuth()를 만들면 로그인 성공 시 폼만
 * authenticated가 되고 헤더는 anonymous로 남는다. 서버 세션은 HttpOnly
 * cookie에 있으므로 브라우저 라우트 어디서든 같은 controller를 읽어야 한다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthController();
  return createElement(AuthContext.Provider, { value: auth }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
