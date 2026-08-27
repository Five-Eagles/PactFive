import { Route, useNavigate, useSearchParams } from 'react-router-dom';
import { LoginForm } from './LoginForm';

/**
 * user-management 라우트 정의 + 경로 상수 (app/web/AGENTS.md "진입점 구조").
 * `App.tsx`가 이 모듈의 `authRoutes`를 가져와 조립한다.
 *
 * 이번 통합 범위는 원본 spec.md의 웹 라우트 목록(`/login`, `/sign-up`, `/auth/confirm`, `/terms`,
 * `/privacy`) 중 `/login`만 포함한다 — 팀장 통합 지시 범위가 `LoginForm.tsx`/`useAuth.ts`/
 * `api/auth.ts`/`auth.routes.tsx`로 한정되어 있어 회원가입·이메일 확인 화면은 만들지 않았다.
 * `AUTH_ROUTES.signUp`은 `LoginForm.tsx`의 안내 링크가 참조하는 경로 상수만 미리 잡아 두되,
 * 실제 페이지가 없으므로 지금은 등록하지 않는다 (feedback_loop 기록 대상).
 */
export const AUTH_ROUTES = {
  login: '/login',
  signUp: '/sign-up',
} as const;

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? undefined;

  return <LoginForm returnTo={returnTo} onNavigate={(path) => navigate(path)} />;
}

export const authRoutes = <Route path={AUTH_ROUTES.login} element={<LoginPage />} />;
