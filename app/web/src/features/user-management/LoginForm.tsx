import { useEffect, useMemo, useState } from 'react';
import { Button, Field } from '../../shared/ui/primitives';
import { AUTH_ROUTES } from './auth.routes';
import { safeReturnToOrRoot } from './return-to';
import { createReturnNavigator, useAuth } from './useAuth';

/**
 * 원본(`features/user-management/prototype/web/LoginForm.tsx`)을 그대로 옮기되, 경로 문자열을
 * `auth.routes.tsx`의 상수로 바꿨다(app/web/AGENTS.md "화면 컴포넌트에 라우트 경로 문자열을
 * 하드코딩하지 않는다"). `/sign-up`은 아직 실제 라우트가 없다 — 링크는 남겨두되 feedback_loop에
 * 기록했다.
 *
 * 2026-08-28: 인라인 스타일과 맨 `<input>`/`<button>`을 `shared/ui`의 `Field`·`Button`으로
 * 바꿨다. 2026-08-27 반영 시점에는 app/web에 디자인 시스템이 없어 인라인으로 뒀던 것이고,
 * 이번에 `shared/ui/`가 생기면서 이 화면만 다른 생김새로 남아 있었다
 * (feedback_loop/2026-08-28/user-management.md 항목 4).
 *
 * **동작은 바꾸지 않았다** — 상태 기계·핸들러·aria 속성·disabled 조건 전부 그대로다.
 * Field가 label과 input을 `htmlFor`/`id`로 잇고 `aria-describedby`까지 붙여 주므로
 * 접근성은 오히려 늘었다.
 */
type LoginFormProps = {
  returnTo?: string;
  onNavigate?: (path: string) => void;
};

export function LoginForm({ returnTo = '/', onNavigate = () => undefined }: LoginFormProps) {
  const { state, login, restore, startOAuth, resendConfirmation } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const safeReturnTo = useMemo(() => safeReturnToOrRoot(returnTo), [returnTo]);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);
  const isBusy = state.status === 'submitting' || state.status === 'restoring' || state.status === 'authenticated';

  useEffect(() => {
    if (state.status === 'authenticated') navigateOnce(safeReturnTo);
  }, [navigateOnce, safeReturnTo, state.status]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const result = await login({ email, password, returnTo: safeReturnTo });
      navigateOnce(result.returnTo);
    } catch {
      // useAuth가 API 계약 오류를 화면 상태로 변환한다.
    }
  };

  const message = state.status === 'anonymous' || state.status === 'retryable' ? state.message : null;

  const handleOAuth = async (provider: 'GOOGLE' | 'KAKAO') => {
    try {
      await startOAuth(provider, safeReturnTo);
    } catch {
      // useAuth가 오류 상태를 표시한다.
    }
  };

  const handleResend = async () => {
    try {
      await resendConfirmation(email);
    } catch {
      // useAuth가 오류 상태를 표시한다.
    }
  };

  const handleRetry = async () => {
    try {
      await restore();
    } catch {
      // 재시도 가능 상태를 유지한다.
    }
  };

  return (
    <main className="page page--narrow" aria-labelledby="login-title">
      <header>
        <p className="card__meta" aria-label="로그인 후 계속할 작업">
          로그인 후 계속할 작업
        </p>
        <h1 id="login-title">로그인</h1>
        {/* ux-philosophy §6 "작업 보호" — 인증 때문에 입력이 날아가지 않는다는 것을 먼저 알린다 */}
        <p className="card__meta">
          <strong>작성 내용 보존됨</strong> · 인증이 끝나면 이전 화면으로 돌아갑니다.
        </p>
      </header>

      {message && (
        <p className="status-line error-line" role="alert">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} aria-busy={isBusy}>
        <Field id="login-email" label="이메일" required>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isBusy}
            required
          />
        </Field>

        <Field id="login-password" label="비밀번호" required helperText="8자 이상 입력해 주세요.">
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호 8자 이상"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isBusy}
            minLength={8}
            required
          />
        </Field>

        <Button variant="primary" type="submit" fullWidth disabled={isBusy} loading={isBusy}>
          이메일로 로그인
        </Button>
      </form>

      <div className="actions" aria-label="소셜 로그인">
        <p className="card__meta">또는</p>
        <Button variant="secondary" disabled={isBusy} onClick={() => void handleOAuth('GOOGLE')}>
          Google로 계속하기
        </Button>
        <Button variant="secondary" disabled={isBusy} onClick={() => void handleOAuth('KAKAO')}>
          Kakao로 계속하기
        </Button>
      </div>

      <p className="card__meta">
        처음이신가요?{' '}
        <a href={`${AUTH_ROUTES.signUp}?returnTo=${encodeURIComponent(safeReturnTo)}`}>회원가입</a>
      </p>

      {state.status === 'anonymous' && state.action === 'RESEND' && (
        <Button variant="quiet" onClick={() => void handleResend()}>
          확인 메일 다시 보내기
        </Button>
      )}
      {state.status === 'anonymous' && state.action === 'COMPLETE_REGISTRATION' && (
        <a href={`${AUTH_ROUTES.signUp}?mode=recovery&returnTo=${encodeURIComponent(safeReturnTo)}`}>
          가입 완료하기
        </a>
      )}
      {state.status === 'retryable' && (
        <Button variant="secondary" onClick={() => void handleRetry()}>
          다시 시도
        </Button>
      )}
    </main>
  );
}
