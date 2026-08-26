import { useEffect, useMemo, useState } from "react";
import { safeReturnToOrRoot } from "../shared/return-to";
import { createReturnNavigator, useAuth } from "./useAuth";

type LoginFormProps = {
  returnTo?: string;
  onNavigate?: (path: string) => void;
};

export function LoginForm({ returnTo = "/", onNavigate = () => undefined }: LoginFormProps) {
  const { state, login, restore, startOAuth, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const safeReturnTo = useMemo(() => safeReturnToOrRoot(returnTo), [returnTo]);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);
  const isBusy = state.status === "submitting" || state.status === "restoring" || state.status === "authenticated";

  useEffect(() => {
    if (state.status === "authenticated") navigateOnce(safeReturnTo);
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

  const message = state.status === "anonymous" || state.status === "retryable" ? state.message : null;

  const handleOAuth = async (provider: "GOOGLE" | "KAKAO") => {
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
    <main aria-labelledby="login-title" style={{ maxWidth: 520, margin: "48px auto", padding: 24 }}>
      <header>
        <p aria-label="로그인 후 계속할 작업">로그인 후 계속할 작업</p>
        <h1 id="login-title">로그인</h1>
        <p><strong>작성 내용 보존됨</strong> · 인증이 끝나면 이전 화면으로 돌아갑니다.</p>
      </header>

      {message && <div role="alert">{message}</div>}

      <form onSubmit={handleSubmit} aria-busy={isBusy}>
        <div>
          <label htmlFor="login-email">이메일</label>
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
        </div>
        <div>
          <label htmlFor="login-password">비밀번호</label>
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
        </div>
        <button type="submit" disabled={isBusy}>이메일로 로그인</button>
      </form>

      <div aria-label="소셜 로그인">
        <p>또는</p>
        <button type="button" disabled={isBusy} onClick={() => void handleOAuth("GOOGLE")}>
          Google로 계속하기
        </button>
        <button type="button" disabled={isBusy} onClick={() => void handleOAuth("KAKAO")}>
          Kakao로 계속하기
        </button>
      </div>

      <p>처음이신가요? <a href={`/sign-up?returnTo=${encodeURIComponent(safeReturnTo)}`}>회원가입</a></p>
      {state.status === "anonymous" && state.action === "RESEND" && (
        <button type="button" onClick={() => void handleResend()}>확인 메일 다시 보내기</button>
      )}
      {state.status === "anonymous" && state.action === "COMPLETE_REGISTRATION" && (
        <a href={`/sign-up?mode=recovery&returnTo=${encodeURIComponent(safeReturnTo)}`}>가입 완료하기</a>
      )}
      {state.status === "retryable" && <button type="button" onClick={() => void handleRetry()}>다시 시도</button>}
    </main>
  );
}
