import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { safeReturnToOrRoot } from "../shared/return-to";
import { AuthFrame, AuthNotice } from "./AuthFrame";
import { createReturnNavigator, useAuth } from "./useAuth";

type LoginFormProps = {
  returnTo?: string;
  onNavigate?: (path: string) => void;
};

type LoginFieldErrors = {
  email?: string;
  password?: string;
};

type LocalFeedback = {
  message: string;
  tone: "info" | "danger" | "success";
};

type RetryAction = "login" | "GOOGLE" | "KAKAO" | "resend" | "restore";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noopNavigate = () => undefined;

function validateEmail(email: string): string | undefined {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return "이메일을 입력해 주세요.";
  if (!EMAIL_PATTERN.test(normalizedEmail)) return "올바른 이메일 주소를 입력해 주세요.";
  return undefined;
}

function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = "비밀번호를 입력해 주세요.";
  else if (password.length < 8) errors.password = "비밀번호를 8자 이상 입력해 주세요.";
  return errors;
}

function getPendingMessage(pendingAction: string | null): string {
  if (pendingAction === "login") return "이메일 로그인 정보를 안전하게 확인하고 있습니다.";
  if (pendingAction === "GOOGLE") return "Google 로그인 창을 준비하고 있습니다.";
  if (pendingAction === "KAKAO") return "Kakao 로그인 창을 준비하고 있습니다.";
  if (pendingAction === "resend") return "확인 메일 재전송 요청을 처리하고 있습니다.";
  if (pendingAction === "logout") return "현재 로그인 세션을 안전하게 종료하고 있습니다.";
  return "인증 요청을 안전하게 처리하고 있습니다.";
}

export function LoginForm({ returnTo = "/", onNavigate = noopNavigate }: LoginFormProps) {
  // 세션 복원은 앱 composition root가 한 번만 수행한다. 폼 자체가 mount 때 복원하면
  // 별도 훅 인스턴스가 중복 요청·초기 오류 안내를 만들 수 있다.
  const { state, login, restore, startOAuth, resendConfirmation, logout } = useAuth({ restoreOnMount: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [localFeedback, setLocalFeedback] = useState<LocalFeedback | null>(null);
  const [lastLoginFailed, setLastLoginFailed] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [retryAction, setRetryAction] = useState<RetryAction | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const safeReturnTo = useMemo(() => safeReturnToOrRoot(returnTo), [returnTo]);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);
  const isBusy = state.status === "submitting"
    || state.status === "restoring"
    || state.status === "authenticated"
    || pendingAction === "logout";

  const serverSubmitError = lastLoginFailed
    && state.status === "anonymous"
    && state.action === null
    ? state.message
    : null;
  const hasFieldErrors = Boolean(fieldErrors.email || fieldErrors.password);
  const hasErrorSummary = hasFieldErrors || Boolean(serverSubmitError);

  useEffect(() => {
    if (state.status === "authenticated") navigateOnce(safeReturnTo);
  }, [navigateOnce, safeReturnTo, state.status]);

  useEffect(() => {
    if (focusRequest === 0) return;
    if (hasErrorSummary) errorSummaryRef.current?.focus();
    else feedbackRef.current?.focus();
  }, [focusRequest, hasErrorSummary]);

  const requestFeedbackFocus = () => setFocusRequest((request) => request + 1);

  const attemptLogin = async () => {
    setPendingAction("login");
    setRetryAction("login");
    try {
      const result = await login({ email: email.trim(), password, returnTo: safeReturnTo });
      setRetryAction(null);
      navigateOnce(result.returnTo);
    } catch {
      setLastLoginFailed(true);
      requestFeedbackFocus();
      // useAuth가 API 계약 오류를 화면 상태로 변환한다.
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateLogin(email, password);
    setFieldErrors(nextErrors);
    setLocalFeedback(null);
    setLastLoginFailed(false);
    if (Object.values(nextErrors).some(Boolean)) {
      requestFeedbackFocus();
      return;
    }
    await attemptLogin();
  };

  const handleOAuth = async (provider: "GOOGLE" | "KAKAO") => {
    setFieldErrors({});
    setLocalFeedback(null);
    setLastLoginFailed(false);
    setPendingAction(provider);
    setRetryAction(provider);
    try {
      await startOAuth(provider, safeReturnTo);
      setRetryAction(null);
    } catch {
      // useAuth가 오류 상태를 표시한다.
    } finally {
      setPendingAction(null);
    }
  };

  const handleResend = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setFieldErrors((current) => ({ ...current, email: emailError }));
      setLocalFeedback(null);
      setLastLoginFailed(false);
      requestFeedbackFocus();
      return;
    }

    setFieldErrors((current) => {
      const next = { ...current };
      delete next.email;
      return next;
    });
    setLocalFeedback(null);
    setLastLoginFailed(false);
    setPendingAction("resend");
    setRetryAction("resend");
    try {
      await resendConfirmation(email.trim());
      setLocalFeedback({
        message: "확인 메일 재전송 요청을 접수했습니다. 계정 존재 여부와 관계없이 같은 안내가 표시됩니다.",
        tone: "info",
      });
      setRetryAction(null);
    } catch {
      requestFeedbackFocus();
      // useAuth가 오류 상태를 표시한다.
    } finally {
      setPendingAction(null);
    }
  };

  const handleRetry = async () => {
    setLocalFeedback(null);
    setLastLoginFailed(false);
    if (retryAction === "login") {
      const nextErrors = validateLogin(email, password);
      setFieldErrors(nextErrors);
      if (Object.values(nextErrors).some(Boolean)) {
        requestFeedbackFocus();
        return;
      }
      await attemptLogin();
      return;
    }
    if (retryAction === "GOOGLE" || retryAction === "KAKAO") {
      await handleOAuth(retryAction);
      return;
    }
    if (retryAction === "resend") {
      await handleResend();
      return;
    }

    setPendingAction("restore");
    setRetryAction("restore");
    try {
      await restore();
      setRetryAction(null);
    } catch {
      requestFeedbackFocus();
      // 재시도 가능 상태를 유지한다.
    } finally {
      setPendingAction(null);
    }
  };

  const handleConflictingSessionLogout = async () => {
    setPendingAction("logout");
    setLocalFeedback(null);
    setLastLoginFailed(false);
    try {
      await logout();
      setLocalFeedback({
        message: "현재 계정에서 로그아웃했습니다. 입력한 계정으로 로그인을 다시 진행해 주세요.",
        tone: "success",
      });
    } catch {
      setLocalFeedback({
        message: "현재 로그인 세션을 종료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
        tone: "danger",
      });
    } finally {
      setPendingAction(null);
      requestFeedbackFocus();
    }
  };

  const clearFieldError = (field: keyof LoginFieldErrors) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const loadingMessage = state.status === "restoring"
    ? "저장된 로그인 상태를 확인하고 있습니다."
    : state.status === "submitting"
      ? getPendingMessage(pendingAction)
      : null;
  const actionMessage = state.status === "anonymous" && state.action ? state.message : null;
  const passiveErrorMessage = state.status === "anonymous" && !state.action && !lastLoginFailed
    ? state.message
    : null;

  return (
    <AuthFrame
      idPrefix="login"
      eyebrow="안전한 계정 확인"
      title="로그인"
      description="사용 중인 계정으로 로그인하고 이전 작업을 계속하세요."
      contextTitle="하던 작업을 그대로 이어가세요"
      contextDescription="로그인 후 이전 작업 화면으로 돌아갑니다. 작성 중인 내용과 이동 목적은 로그인 과정에서 바뀌지 않습니다."
      contextState={state.status === "authenticated" ? "복귀 위치 확인됨" : "작성 내용 보존됨"}
      returnTo={safeReturnTo}
      returnCardTitle="로그인 후 계속할 작업"
    >
      {loadingMessage && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice>
            <span className="pf-auth-progress">
              <span className="pf-auth-spinner" aria-hidden="true" />
              {loadingMessage}
            </span>
          </AuthNotice>
        </div>
      )}
      {state.status === "authenticated" && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice tone="success">로그인이 완료되었습니다. 이전 작업으로 이동합니다.</AuthNotice>
        </div>
      )}
      {!loadingMessage && state.status !== "authenticated" && localFeedback && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice tone={localFeedback.tone} role={localFeedback.tone === "danger" ? "alert" : "status"}>
            {localFeedback.message}
          </AuthNotice>
        </div>
      )}
      {!loadingMessage && state.status !== "authenticated" && !localFeedback && state.status === "retryable" && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice tone="danger" role="alert">{state.message}</AuthNotice>
        </div>
      )}
      {!loadingMessage && state.status !== "authenticated" && !localFeedback && actionMessage && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice
            tone={state.status === "anonymous" && state.action === "LOGOUT" ? "danger" : "info"}
            role={state.status === "anonymous" && state.action === "LOGOUT" ? "alert" : "status"}
          >
            {actionMessage}
          </AuthNotice>
        </div>
      )}
      {!loadingMessage && state.status !== "authenticated" && !localFeedback && passiveErrorMessage && (
        <div ref={feedbackRef} tabIndex={-1}>
          <AuthNotice tone="danger" role="alert">{passiveErrorMessage}</AuthNotice>
        </div>
      )}

      {state.status === "anonymous" && state.action === "RESEND" && (
        <div className="pf-auth-actions pf-auth-flow-before">
          <button className="pf-auth-button pf-auth-button--secondary" type="button" disabled={isBusy} onClick={() => void handleResend()}>
            확인 메일 다시 보내기
          </button>
        </div>
      )}
      {state.status === "anonymous" && state.action === "COMPLETE_REGISTRATION" && (
        <div className="pf-auth-actions pf-auth-flow-before">
          <a
            className="pf-auth-button pf-auth-button--secondary"
            href={`/sign-up?mode=recovery&returnTo=${encodeURIComponent(safeReturnTo)}`}
          >
            가입 완료하기
          </a>
        </div>
      )}
      {state.status === "anonymous" && state.action === "LOGOUT" && (
        <div className="pf-auth-actions pf-auth-flow-before">
          <button
            className="pf-auth-button pf-auth-button--secondary"
            type="button"
            disabled={isBusy}
            onClick={() => void handleConflictingSessionLogout()}
          >
            현재 계정 로그아웃
          </button>
        </div>
      )}
      {state.status === "retryable" && (
        <div className="pf-auth-actions pf-auth-flow-before">
          <button className="pf-auth-button pf-auth-button--secondary" type="button" disabled={isBusy} onClick={() => void handleRetry()}>
            다시 시도
          </button>
        </div>
      )}

      <div className="pf-auth-oauth" aria-label="소셜 계정 로그인">
        <button className="pf-auth-button pf-auth-button--secondary" type="button" disabled={isBusy} onClick={() => void handleOAuth("GOOGLE")}>
          <span aria-hidden="true">G</span>
          <span>Google로 계속하기</span>
        </button>
        <button className="pf-auth-button pf-auth-button--secondary" type="button" disabled={isBusy} onClick={() => void handleOAuth("KAKAO")}>
          <span aria-hidden="true">K</span>
          <span>Kakao로 계속하기</span>
        </button>
      </div>
      <p className="pf-auth-help pf-auth-support-copy">
        처음 소셜 계정으로 가입하면 회원가입 화면에서 역할을 선택한 뒤 인증을 계속합니다.
      </p>

      <div className="pf-auth-divider pf-auth-divider--spaced" aria-hidden="true">또는 이메일로 로그인</div>

      <form className="pf-auth-form" onSubmit={handleSubmit} noValidate aria-busy={isBusy}>
        <input name="returnTo" type="hidden" value={safeReturnTo} />

        {hasErrorSummary && (
          <div className="pf-auth-error-summary" ref={errorSummaryRef} role="alert" tabIndex={-1}>
            <strong>로그인 정보를 확인해 주세요.</strong>
            {serverSubmitError && <span>{serverSubmitError}</span>}
            {hasFieldErrors && (
              <ul>
                {fieldErrors.email && <li><a className="pf-auth-link" href="#login-email">{fieldErrors.email}</a></li>}
                {fieldErrors.password && <li><a className="pf-auth-link" href="#login-password">{fieldErrors.password}</a></li>}
              </ul>
            )}
          </div>
        )}

        <div className="pf-auth-field">
          <label className="pf-auth-label" htmlFor="login-email">이메일</label>
          <input
            className="pf-auth-input"
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError("email");
            }}
            disabled={isBusy}
            required
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            aria-errormessage={fieldErrors.email ? "login-email-error" : undefined}
          />
          {fieldErrors.email && <p className="pf-auth-field-error" id="login-email-error">{fieldErrors.email}</p>}
        </div>

        <div className="pf-auth-field">
          <label className="pf-auth-label" htmlFor="login-password">비밀번호</label>
          <div className="pf-auth-input-wrap">
            <input
              className="pf-auth-input pf-auth-password-input"
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="비밀번호 8자 이상"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
              }}
              disabled={isBusy}
              minLength={8}
              required
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              aria-errormessage={fieldErrors.password ? "login-password-error" : undefined}
            />
            <button
              className="pf-auth-password-toggle"
              type="button"
              disabled={isBusy}
              aria-controls="login-password"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            </button>
          </div>
          {fieldErrors.password && <p className="pf-auth-field-error" id="login-password-error">{fieldErrors.password}</p>}
        </div>

        <button className="pf-auth-button pf-auth-button--primary" type="submit" disabled={isBusy}>
          {isBusy && <span className="pf-auth-spinner" aria-hidden="true" />}
          {state.status === "submitting" && pendingAction === "login"
            ? "로그인 중…"
            : state.status === "restoring"
              ? "로그인 상태 확인 중…"
              : state.status === "authenticated"
                ? "이동 중…"
                : "이메일로 로그인"}
        </button>
      </form>

      <p className="pf-auth-prompt">
        처음이신가요?{" "}
        <a className="pf-auth-link" href={`/sign-up?returnTo=${encodeURIComponent(safeReturnTo)}`}>회원가입</a>
      </p>
    </AuthFrame>
  );
}
