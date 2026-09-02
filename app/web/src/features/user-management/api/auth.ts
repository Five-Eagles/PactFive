import { http } from '../../../shared/http';
import type {
  AuthContext,
  AuthenticatedSessionResponse,
  CreateAuthSessionInput,
  CreateOAuthAuthorizationInput,
  CreateOAuthAuthorizationResponse,
  RefreshAuthSessionResponse,
  RequestEmailConfirmationResponse,
} from '../auth.types';

/**
 * user-management API 호출 — 반드시 `shared/http.ts`의 `http` 객체를 거친다
 * (app/web/AGENTS.md "폴더 간 접점"). 원본(`features/user-management/prototype/web/api/auth.ts`)은
 * `fetch`를 직접 호출했으나, 팀장 통합 시 이 파일을 `http.post`/`http.get`/`http.delete`로
 * 재해석했다. 인증 헤더 주입·401 공통 처리·JSON 직렬화는 이제 `shared/http.ts`가 책임진다 —
 * 다만 로그인 성공 응답의 accessToken은 화면 상태(브라우저 메모리)에만 두고
 * `shared/http.ts`의 `setAuthTokenProvider`로 주입하는 건 `useAuth.ts`가 담당한다.
 *
 * refresh/login/oauth-authorizations/logout처럼 서버 쿠키를 만들거나 바꾸는 요청은 원본과 같은
 * 순서로 실행되도록 아래 mutation queue를 유지한다 — 같은 탭에서 로그인·로그아웃·갱신이 겹치면
 * 쿠키 경합이 생길 수 있다(원본 auth-service.ts의 "확정된 세션 동기화 책임" 참고).
 */

type RequestEmailConfirmationInput = { email: string };

export function createAuthMutationQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function runMutation<T>(mutation: () => Promise<T>): Promise<T> {
    const result = tail.then(mutation, mutation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

const runAuthMutation = createAuthMutationQueue();

export function createRefreshCoordinator(
  refresh: (coordinationKey?: unknown) => Promise<RefreshAuthSessionResponse>,
): (coordinationKey?: unknown) => Promise<RefreshAuthSessionResponse> {
  const inFlightByKey = new Map<unknown, Promise<RefreshAuthSessionResponse>>();
  return (coordinationKey: unknown = 'default') => {
    const existing = inFlightByKey.get(coordinationKey);
    if (existing) return existing;
    const pending = refresh(coordinationKey).finally(() => {
      if (inFlightByKey.get(coordinationKey) === pending) inFlightByKey.delete(coordinationKey);
    });
    inFlightByKey.set(coordinationKey, pending);
    return pending;
  };
}

export function createAuthSession(input: CreateAuthSessionInput): Promise<AuthenticatedSessionResponse> {
  return runAuthMutation(() => http.post<AuthenticatedSessionResponse>('/v1/auth/sessions', input));
}

// `skipUnauthorizedHandler` — 이 호출의 401은 "세션이 만료됐다"가 아니라 대개 "로그인한 적이
// 없다"이다. 전역 401 처리(로그인 화면으로 이동)를 태우면 앱 시작 시의 세션 복원이 무한
// 리로드가 된다. 호출부(useAuth)가 ApiError를 받아 anonymous로 처리한다.
const coordinatedRefreshAuthSession = createRefreshCoordinator(() =>
  runAuthMutation(() =>
    http.post<RefreshAuthSessionResponse>('/v1/auth/sessions/refresh', {}, {
      skipUnauthorizedHandler: true,
    }),
  ),
);

export function refreshAuthSession(authFlowKey: unknown = 'default'): Promise<RefreshAuthSessionResponse> {
  return coordinatedRefreshAuthSession(authFlowKey);
}

export function getCurrentAuthContext(accessToken: string): Promise<AuthContext> {
  // 세션 복원 직후에는 shared/http.ts의 토큰 provider가 아직 새 토큰을 모를 수 있어
  // authToken override로 명시적으로 넘긴다 (provider는 useAuth.ts가 별도로 갱신한다).
  //
  // refresh와 짝을 이루는 복원 흐름의 두 번째 호출이라 401 전역 처리도 함께 건너뛴다 —
  // 방금 받은 토큰이 거부되면 그것도 "로그인 상태가 아니다"라는 답이다.
  return http.get<AuthContext>('/v1/auth/contexts/current', {
    authToken: accessToken,
    skipUnauthorizedHandler: true,
  });
}

export function requestEmailConfirmation(email: string): Promise<RequestEmailConfirmationResponse> {
  const body: RequestEmailConfirmationInput = { email };
  return runAuthMutation(() =>
    http.post<RequestEmailConfirmationResponse>('/v1/auth/email-confirmation-requests', body),
  );
}

export function createOAuthAuthorization(
  input: CreateOAuthAuthorizationInput,
): Promise<CreateOAuthAuthorizationResponse> {
  return runAuthMutation(() =>
    http.post<CreateOAuthAuthorizationResponse>('/v1/auth/oauth-authorizations', input),
  );
}

export function deleteCurrentAuthSession(): Promise<void> {
  return runAuthMutation(() => http.delete<void>('/v1/auth/sessions/current'));
}
