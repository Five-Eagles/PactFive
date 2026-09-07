import { Route, useNavigate, useSearchParams } from 'react-router-dom';
import { LoginForm } from './LoginForm';
import { SignUpForm, type SignUpMode } from './SignUpForm';
import { EmailConfirmationPage } from './EmailConfirmationPage';

/**
 * user-management 라우트 정의 + 경로 상수 (app/web/AGENTS.md "진입점 구조").
 * `App.tsx`가 이 모듈의 `authRoutes`를 가져와 조립한다.
 *
 * 2026-08-27 1차 반영은 `/login`만 포함했다 — 회원가입·이메일 확인 화면은 그때 통합 범위 밖이었다
 * (`AUTH_ROUTES.signUp` 상수만 미리 잡아 `LoginForm.tsx`의 안내 링크가 참조하게 해뒀다).
 * 2026-09-05 — `/sign-up`·`/auth/confirm`을 마저 이식했다(feedback_loop/2026-09-05/
 * user-management.md). `/terms`·`/privacy`는 project-management의 info.routes.tsx가 이미
 * 서빙한다 — 이 파일이 다시 만들지 않는다.
 */
export const AUTH_ROUTES = {
  login: '/login',
  signUp: '/sign-up',
  confirm: '/auth/confirm',
} as const;

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? undefined;

  return <LoginForm returnTo={returnTo} onNavigate={(path) => navigate(path)} />;
}

function SignUpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') ?? undefined;
  const mode: SignUpMode = searchParams.get('mode') === 'recovery' ? 'recovery' : 'register';

  return <SignUpForm mode={mode} returnTo={returnTo} onNavigate={(path) => navigate(path)} />;
}

function ConfirmEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token') ?? searchParams.get('tokenHash') ?? '';

  return <EmailConfirmationPage tokenHash={tokenHash} onNavigate={(path) => navigate(path)} />;
}

export const authRoutes = (
  <>
    <Route path={AUTH_ROUTES.login} element={<LoginPage />} />
    <Route path={AUTH_ROUTES.signUp} element={<SignUpPage />} />
    <Route path={AUTH_ROUTES.confirm} element={<ConfirmEmailPage />} />
  </>
);
