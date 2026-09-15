import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { UserRole } from "../server/auth.types";
import { safeReturnToOrRoot } from "../shared/return-to";
import { AuthFrame, AuthNotice } from "./AuthFrame";
import { AuthApiError } from "./api/auth";
import { createReturnNavigator, useAuth } from "./useAuth";

export type SignUpMode = "register" | "recovery";

export type SignUpDraft = {
  role: UserRole | null;
  name: string;
  email: string;
  password: string;
};

export type SignUpFieldErrors = Partial<Record<keyof SignUpDraft, string>>;

export function validateSignUpDraft(draft: SignUpDraft): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  if (!draft.role) errors.role = "의뢰인 또는 프리랜서 중 역할을 선택해 주세요.";
  if (!draft.name.trim()) errors.name = "이름을 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  }
  if (draft.password.length < 8) errors.password = "비밀번호를 8자 이상 입력해 주세요.";
  return errors;
}

export function hasSignUpErrors(errors: SignUpFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function isTerminalRecoveryError(error: unknown): boolean {
  return error instanceof AuthApiError && terminalRecoveryCodes.has(error.code);
}

export type SignUpFormProps = {
  mode?: SignUpMode;
  returnTo?: string;
  onNavigate?: (path: string) => void;
  /** prototype/run.tsx와 디자인 검수에서 접수 상태를 네트워크 없이 렌더링한다. */
  previewState?: "form" | "accepted";
};

type ResendState =
  | { status: "idle"; message: null }
  | { status: "submitting"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SessionEndFeedback = {
  message: string;
  tone: "info" | "danger" | "success";
};

const initialDraft: SignUpDraft = { role: null, name: "", email: "", password: "" };
const initialResendState: ResendState = { status: "idle", message: null };
const noopNavigate = () => undefined;
const terminalRecoveryCodes = new Set([
  "REGISTRATION_RECOVERY_INVALID",
  "REGISTRATION_RECOVERY_EXPIRED",
  "REGISTRATION_NOT_AVAILABLE",
]);
const signUpErrorTargets: Record<keyof SignUpDraft, string> = {
  role: "sign-up-role-client",
  name: "sign-up-name",
  email: "sign-up-email",
  password: "sign-up-password",
};

export function SignUpForm({
  mode = "register",
  returnTo = "/",
  onNavigate = noopNavigate,
  previewState = "form",
}: SignUpFormProps) {
  const { state, register, completeRegistration, startOAuth, resendConfirmation, logout } = useAuth({
    restoreOnMount: false,
  });
  const [draft, setDraft] = useState<SignUpDraft>(initialDraft);
  const [errors, setErrors] = useState<SignUpFieldErrors>({});
  const [registrationAccepted, setRegistrationAccepted] = useState(previewState === "accepted");
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>(initialResendState);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [validationAttempt, setValidationAttempt] = useState(0);
  const [roleFocusRequest, setRoleFocusRequest] = useState(0);
  const [shouldFocusEmail, setShouldFocusEmail] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [sessionEndFeedback, setSessionEndFeedback] = useState<SessionEndFeedback | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const firstRoleRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const safeReturnTo = useMemo(() => safeReturnToOrRoot(returnTo), [returnTo]);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);
  const isRecovery = mode === "recovery";
  const isBusy = state.status === "submitting" || state.status === "authenticated" || endingSession;
  const stateMessage = state.status === "anonymous" || state.status === "retryable"
    ? state.message
    : null;
  const hasErrors = hasSignUpErrors(errors);

  useEffect(() => {
    if (validationAttempt > 0 && hasErrors) errorSummaryRef.current?.focus();
  }, [hasErrors, validationAttempt]);

  useEffect(() => {
    if (roleFocusRequest > 0) firstRoleRef.current?.focus();
  }, [roleFocusRequest]);

  useEffect(() => {
    if (!registrationAccepted && shouldFocusEmail) {
      emailRef.current?.focus();
      setShouldFocusEmail(false);
    }
  }, [registrationAccepted, shouldFocusEmail]);

  useEffect(() => {
    if (state.status === "authenticated") {
      navigateOnce(safeReturnToOrRoot(state.session.returnTo));
    }
  }, [navigateOnce, state]);

  const update = <K extends keyof SignUpDraft>(field: K, value: SignUpDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = () => {
    const nextErrors = validateSignUpDraft(draft);
    setErrors(nextErrors);
    const invalid = hasSignUpErrors(nextErrors);
    if (invalid) setValidationAttempt((current) => current + 1);
    return !invalid;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSessionEndFeedback(null);
    if (!validate()) return;

    const input = {
      email: draft.email.trim(),
      password: draft.password,
      name: draft.name.trim(),
      role: draft.role as UserRole,
      returnTo: safeReturnTo,
    };

    try {
      if (isRecovery) {
        const session = await completeRegistration(input);
        setDraft((current) => ({ ...current, password: "" }));
        setPasswordVisible(false);
        navigateOnce(safeReturnToOrRoot(session.returnTo));
        return;
      }

      const response = await register(input);
      setDraft((current) => ({ ...current, password: "" }));
      setPasswordVisible(false);
      setAcceptedMessage(response.message);
      setResendState(initialResendState);
      setRegistrationAccepted(true);
    } catch (error) {
      // 수정 가능한 오류와 일시 장애에서는 입력을 보존한다. 복구 권한이 끝난 경우에만
      // 브라우저 메모리에 남은 비밀번호를 지우고 로그인에서 복구를 다시 시작하게 한다.
      if (isRecovery && isTerminalRecoveryError(error)) {
        setDraft((current) => ({ ...current, password: "" }));
        setPasswordVisible(false);
      }
    }
  };

  const handleOAuth = async (provider: "GOOGLE" | "KAKAO") => {
    setSessionEndFeedback(null);
    if (!draft.role) {
      setErrors((current) => ({
        ...current,
        role: "소셜 가입을 계속하려면 먼저 역할을 선택해 주세요.",
      }));
      setRoleFocusRequest((current) => current + 1);
      return;
    }

    try {
      await startOAuth(provider, safeReturnTo, draft.role);
    } catch {
      // useAuth가 계약 오류를 화면 상태로 변환한다. 사용자가 고른 역할은 그대로 둔다.
    }
  };

  const handleResend = async () => {
    setResendState({ status: "submitting", message: "확인 메일 재전송을 요청하고 있습니다." });
    try {
      await resendConfirmation(draft.email.trim());
      setResendState({
        status: "success",
        message: "재전송 요청을 접수했습니다. 받은편지함과 스팸함을 확인해 주세요.",
      });
    } catch (error) {
      setResendState({
        status: "error",
        message: error instanceof AuthApiError
          ? error.message
          : "재전송 요청을 완료할 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
      });
    }
  };

  const handleEditEmail = () => {
    setRegistrationAccepted(false);
    setAcceptedMessage(null);
    setResendState(initialResendState);
    setErrors({});
    setShouldFocusEmail(true);
  };

  const handleConflictingSessionLogout = async () => {
    setEndingSession(true);
    setSessionEndFeedback({ message: "현재 로그인 세션을 안전하게 종료하고 있습니다.", tone: "info" });
    try {
      await logout();
      setSessionEndFeedback({
        message: "현재 계정에서 로그아웃했습니다. 가입 또는 가입 복구를 다시 진행해 주세요.",
        tone: "success",
      });
    } catch {
      setSessionEndFeedback({
        message: "현재 로그인 세션을 종료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
        tone: "danger",
      });
    } finally {
      setEndingSession(false);
    }
  };

  const loginHref = `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;

  if (registrationAccepted) {
    const resendBusy = resendState.status === "submitting";
    return (
      <AuthFrame
        idPrefix="sign-up-accepted"
        eyebrow="다음 단계 안내"
        title="가입 요청을 접수했습니다"
        description="메일함에서 PactFive 확인 안내를 찾아 다음 단계를 진행해 주세요."
        contextTitle="가입 정보는 확인 전까지 대기합니다"
        contextDescription="메일 링크를 여는 것만으로 가입이 완료되지 않습니다. 확인 화면에서 직접 계속해야 계정과 세션이 만들어집니다."
        contextState="가입 요청 접수 · 이메일 확인 대기"
        returnTo={safeReturnTo}
        returnCardTitle="가입 후 계속할 작업"
        focusTitleOnMount
      >
        <AuthNotice>
          {acceptedMessage || "가입 가능한 경우 입력한 이메일로 확인 안내를 보냈습니다."}
        </AuthNotice>
        <p className="pf-auth-help">
          계정 존재 여부를 보호하기 위해 모든 요청에 같은 안내를 표시합니다. 메일이 보이지 않으면
          받은편지함과 스팸함을 확인해 주세요.
        </p>
        {resendState.status !== "idle" && (
          <div className="pf-auth-notice-after">
            <AuthNotice
              tone={resendState.status === "error" ? "danger" : "info"}
              role={resendState.status === "error" ? "alert" : "status"}
            >
              {resendState.message}
            </AuthNotice>
          </div>
        )}
        <div className="pf-auth-actions pf-auth-flow-after">
          <button
            className="pf-auth-button pf-auth-button--secondary"
            type="button"
            onClick={() => void handleResend()}
            disabled={resendBusy}
          >
            {resendBusy ? (
              <span className="pf-auth-progress">
                <span className="pf-auth-spinner" aria-hidden="true" /> 재전송 요청 중…
              </span>
            ) : resendState.status === "error" ? "확인 메일 다시 요청하기" : "확인 메일 다시 보내기"}
          </button>
          <button
            className="pf-auth-button pf-auth-button--quiet"
            type="button"
            onClick={handleEditEmail}
            disabled={resendBusy}
          >
            이메일 주소 수정하기
          </button>
          <a className="pf-auth-button pf-auth-button--quiet" href={loginHref}>로그인으로 돌아가기</a>
        </div>
      </AuthFrame>
    );
  }

  const roleField = (
    <fieldset
      className="pf-auth-role pf-auth-field"
      aria-describedby={`sign-up-role-help${errors.role ? " sign-up-role-error" : ""}`}
      aria-invalid={Boolean(errors.role)}
      aria-errormessage={errors.role ? "sign-up-role-error" : undefined}
    >
      <legend>이용 역할</legend>
      <p className="pf-auth-help" id="sign-up-role-help">가입 완료 후에는 역할을 변경할 수 없습니다.</p>
      <div className="pf-auth-role-grid">
        {([
          ["CLIENT", "의뢰인", "프로젝트를 등록하고 전문가와 협업합니다."],
          ["FREELANCER", "프리랜서", "프로젝트를 찾아 지원하고 작업합니다."],
        ] as const).map(([value, label, detail], index) => (
          <label className="pf-auth-role-card" key={value}>
            <span className="pf-auth-role-main">
              <input
                id={value === "CLIENT" ? "sign-up-role-client" : "sign-up-role-freelancer"}
                ref={index === 0 ? firstRoleRef : undefined}
                type="radio"
                name="role"
                value={value}
                checked={draft.role === value}
                onChange={() => update("role", value)}
                disabled={isBusy}
                required
                aria-required="true"
                aria-invalid={Boolean(errors.role)}
                aria-describedby={`sign-up-role-help${errors.role ? " sign-up-role-error" : ""}`}
                aria-errormessage={errors.role ? "sign-up-role-error" : undefined}
              />
              {label}
            </span>
            <small>{detail}</small>
          </label>
        ))}
      </div>
      {errors.role && <p className="pf-auth-field-error" id="sign-up-role-error">{errors.role}</p>}
    </fieldset>
  );

  const oauthFields = (
    <>
      <div className="pf-auth-oauth" aria-label="소셜 계정으로 회원가입">
        <button
          className="pf-auth-button pf-auth-button--secondary"
          type="button"
          onClick={() => void handleOAuth("GOOGLE")}
          disabled={isBusy}
        >
          Google로 계속하기
        </button>
        <button
          className="pf-auth-button pf-auth-button--secondary"
          type="button"
          onClick={() => void handleOAuth("KAKAO")}
          disabled={isBusy}
        >
          Kakao로 계속하기
        </button>
      </div>
      <div className="pf-auth-divider" aria-hidden="true">또는 이메일로 가입</div>
    </>
  );

  const nameField = (
    <div className="pf-auth-field">
      <label className="pf-auth-label" htmlFor="sign-up-name">이름</label>
      <input
        className="pf-auth-input"
        id="sign-up-name"
        name="name"
        autoComplete="name"
        value={draft.name}
        onChange={(event) => update("name", event.target.value)}
        disabled={isBusy}
        required
        aria-required="true"
        aria-invalid={Boolean(errors.name)}
        aria-describedby={errors.name ? "sign-up-name-error" : undefined}
        aria-errormessage={errors.name ? "sign-up-name-error" : undefined}
        placeholder="이름을 입력해 주세요"
      />
      {errors.name && <p className="pf-auth-field-error" id="sign-up-name-error">{errors.name}</p>}
    </div>
  );

  const emailField = (
    <div className="pf-auth-field">
      <label className="pf-auth-label" htmlFor="sign-up-email">이메일</label>
      <input
        ref={emailRef}
        className="pf-auth-input"
        id="sign-up-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={draft.email}
        onChange={(event) => update("email", event.target.value)}
        disabled={isBusy}
        required
        aria-required="true"
        aria-invalid={Boolean(errors.email)}
        aria-describedby={errors.email ? "sign-up-email-error" : undefined}
        aria-errormessage={errors.email ? "sign-up-email-error" : undefined}
        placeholder="name@example.com"
      />
      {errors.email && <p className="pf-auth-field-error" id="sign-up-email-error">{errors.email}</p>}
    </div>
  );

  const passwordField = (
    <div className="pf-auth-field">
      <label className="pf-auth-label" htmlFor="sign-up-password">비밀번호</label>
      <div className="pf-auth-input-wrap">
        <input
          className="pf-auth-input pf-auth-password-input"
          id="sign-up-password"
          name="password"
          type={passwordVisible ? "text" : "password"}
          autoComplete={isRecovery ? "current-password" : "new-password"}
          value={draft.password}
          onChange={(event) => update("password", event.target.value)}
          disabled={isBusy}
          minLength={8}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={`sign-up-password-help${errors.password ? " sign-up-password-error" : ""}`}
          aria-errormessage={errors.password ? "sign-up-password-error" : undefined}
          placeholder="비밀번호 8자 이상"
        />
        <button
          className="pf-auth-password-toggle"
          type="button"
          aria-controls="sign-up-password"
          aria-pressed={passwordVisible}
          onClick={() => setPasswordVisible((visible) => !visible)}
          disabled={isBusy}
        >
          {passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
        </button>
      </div>
      <p className="pf-auth-help" id="sign-up-password-help">8자 이상 입력해 주세요.</p>
      {errors.password && <p className="pf-auth-field-error" id="sign-up-password-error">{errors.password}</p>}
    </div>
  );

  const submitButton = (
    <button className="pf-auth-button pf-auth-button--primary" type="submit" disabled={isBusy}>
      {isBusy ? (
        <span className="pf-auth-progress" role="status">
          <span className="pf-auth-spinner" aria-hidden="true" /> 가입 정보를 확인하고 있습니다.
        </span>
      ) : isRecovery ? "가입 완료하기" : "확인 메일 받기"}
    </button>
  );

  return (
    <AuthFrame
      idPrefix="sign-up"
      eyebrow={isRecovery ? "계정 소유권 다시 확인" : "안전한 계정 만들기"}
      title={isRecovery ? "가입 완료하기" : "회원가입"}
      description={isRecovery
        ? "같은 이메일과 비밀번호로 소유권을 확인하고 가입 정보를 다시 입력해 주세요."
        : "사용할 역할과 가입 방법을 선택해 주세요."}
      contextTitle={isRecovery ? "확인된 계정을 안전하게 이어 붙입니다" : "필요한 정보만 받고 바로 시작합니다"}
      contextDescription={isRecovery
        ? "보안을 위해 이전 가입 정보는 자동으로 복원하지 않습니다. 제한된 시간 안에 소유권을 다시 확인해 주세요."
        : "가입할 때는 계정과 역할만 정합니다. 상세 프로필은 실제로 필요한 순간에 이어서 입력합니다."}
      contextState={isRecovery ? "이메일 확인 완료 · 소유권 재확인 필요" : "역할과 가입 방법 선택 중"}
      returnTo={safeReturnTo}
      returnCardTitle="가입 후 계속할 작업"
    >
      {isRecovery && (
        <AuthNotice>
          이 화면은 로그인에서 계정 소유권을 확인한 뒤에만 사용할 수 있습니다. 실패해도 수정 가능한
          입력과 돌아갈 위치는 유지됩니다.
        </AuthNotice>
      )}
      {sessionEndFeedback && (
        <AuthNotice
          tone={sessionEndFeedback.tone}
          role={sessionEndFeedback.tone === "danger" ? "alert" : "status"}
        >
          {sessionEndFeedback.message}
        </AuthNotice>
      )}
      {stateMessage && <AuthNotice tone="danger" role="alert">{stateMessage}</AuthNotice>}
      {state.status === "submitting" && (
        <AuthNotice>가입 정보를 안전하게 확인하고 있습니다.</AuthNotice>
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
      {hasErrors && (
        <div className="pf-auth-error-summary" ref={errorSummaryRef} tabIndex={-1} role="alert">
          <strong>입력 정보를 확인해 주세요.</strong>
          <ul>
            {Object.entries(errors)
              .filter((entry): entry is [keyof SignUpDraft, string] => Boolean(entry[1]))
              .map(([field, message]) => (
                <li key={field}>
                  <a className="pf-auth-link" href={`#${signUpErrorTargets[field]}`}>{message}</a>
                </li>
              ))}
          </ul>
        </div>
      )}

      <form className="pf-auth-form" onSubmit={(event) => void handleSubmit(event)} noValidate aria-busy={isBusy}>
        {isRecovery ? (
          <>
            {emailField}
            {passwordField}
            {nameField}
            {roleField}
            {submitButton}
          </>
        ) : (
          <>
            {roleField}
            {oauthFields}
            {nameField}
            {emailField}
            {passwordField}
            {submitButton}
          </>
        )}
      </form>

      <p className="pf-auth-prompt">
        이미 계정이 있나요? <a className="pf-auth-link" href={loginHref}>로그인</a>
      </p>
    </AuthFrame>
  );
}
