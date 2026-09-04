import { useEffect, useMemo, useRef, useState } from "react";
import { safeReturnToOrRoot } from "../shared/return-to";
import { AuthApiError } from "./api/auth";
import { AuthFrame, AuthNotice } from "./AuthFrame";
import { AUTH_ROUTES } from "./auth.routes";
import { createReturnNavigator, useAuth } from "./useAuth";

export type EmailConfirmationPhase =
  | "missing"
  | "ready"
  | "verifying"
  | "success"
  | "expired"
  | "unavailable"
  | "recovery"
  | "context-conflict"
  | "rate-limited"
  | "retryable"
  | "sync-error"
  | "error";

type ConfirmationFailure = {
  phase: Exclude<EmailConfirmationPhase, "missing" | "ready" | "verifying" | "success">;
  message: string;
  retryAfterSeconds?: number;
};

export function classifyEmailConfirmationFailure(error: unknown): ConfirmationFailure {
  if (!(error instanceof AuthApiError)) {
    return { phase: "retryable", message: "잠시 후 다시 시도해 주세요." };
  }

  if (error.code === "REGISTRATION_COMPLETION_REQUIRED") {
    return {
      phase: "recovery",
      message: "이메일 확인은 끝났지만 PactFive 계정 연결을 마치려면 소유권을 다시 확인해야 합니다.",
    };
  }
  if (error.code === "AUTH_SESSION_SYNC_FAILED") {
    return {
      phase: "sync-error",
      message: "이메일 확인은 처리됐지만 계정 연결을 마치지 못했습니다.",
    };
  }
  if (
    error.code === "EMAIL_CONFIRMATION_INVALID"
    || error.code === "EMAIL_CONFIRMATION_EXPIRED"
  ) {
    return {
      phase: "expired",
      message: "확인 링크가 유효하지 않거나 만료됐습니다.",
    };
  }
  if (error.code === "EMAIL_CONFIRMATION_NOT_AVAILABLE") {
    return {
      phase: "unavailable",
      message: "이 확인 요청을 완료할 수 없습니다. 계정 상태는 로그인에서 다시 확인해 주세요.",
    };
  }
  if (error.status === 429) {
    const waitSeconds = Math.max(1, Math.min(3_600, error.retryAfterSeconds ?? 30));
    return {
      phase: "rate-limited",
      message: `요청이 잠시 제한됐습니다. ${waitSeconds}초 후 다시 시도해 주세요.`,
      retryAfterSeconds: waitSeconds,
    };
  }
  if (error.code === "AUTH_PROVIDER_UNAVAILABLE" || (error.status >= 500 && error.status <= 599)) {
    return { phase: "retryable", message: "인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (error.code === "AUTH_CONTEXT_CONFLICT") {
    return { phase: "context-conflict", message: "현재 로그인 세션에서 먼저 로그아웃한 뒤 다시 시도해 주세요." };
  }
  return { phase: "error", message: "이메일 확인을 완료할 수 없습니다." };
}

export type EmailConfirmationScreenProps = {
  phase: EmailConfirmationPhase;
  message?: string;
  returnTo?: string;
  onConfirm?: () => void;
  onRetry?: () => void;
  onContinue?: () => void;
  onLogout?: () => void;
  signingOut?: boolean;
  retryAfterSeconds?: number;
};

type ScreenCopy = {
  eyebrow: string;
  contextState: string;
  notice: string;
  tone: "info" | "danger" | "success";
  alert: boolean;
};

function getScreenCopy(phase: EmailConfirmationPhase, message?: string): ScreenCopy {
  switch (phase) {
    case "missing":
      return {
        eyebrow: "확인 링크 필요",
        contextState: "아직 계정과 세션을 만들지 않았습니다.",
        notice: "확인 링크가 없거나 올바르지 않습니다. 메일의 링크를 다시 열거나 회원가입을 다시 시작해 주세요.",
        tone: "danger",
        alert: true,
      };
    case "verifying":
      return {
        eyebrow: "확인 처리 중",
        contextState: "이메일 확인과 계정 연결을 처리하고 있습니다.",
        notice: "이메일 확인과 계정 연결을 안전하게 처리하고 있습니다.",
        tone: "info",
        alert: false,
      };
    case "success":
      return {
        eyebrow: "확인 완료",
        contextState: "계정과 세션 생성이 완료됐습니다.",
        notice: "이메일 확인을 완료했습니다. 가입할 때 저장한 화면으로 이동할 수 있습니다.",
        tone: "success",
        alert: false,
      };
    case "expired":
      return {
        eyebrow: "새 확인 링크 필요",
        contextState: "계정과 세션은 새 요청 전까지 변경되지 않습니다.",
        notice: message ?? "확인 링크가 유효하지 않거나 만료됐습니다. 이미 사용한 링크도 같은 안내를 표시합니다.",
        tone: "danger",
        alert: true,
      };
    case "unavailable":
      return {
        eyebrow: "로그인에서 확인 필요",
        contextState: "계정 상태를 노출하지 않고 확인 요청을 중단했습니다.",
        notice: message ?? "이 확인 요청을 완료할 수 없습니다. 계정 상태는 로그인에서 다시 확인해 주세요.",
        tone: "danger",
        alert: true,
      };
    case "recovery":
      return {
        eyebrow: "가입 복구 필요",
        contextState: "로그인에서 소유권 확인이 필요합니다.",
        notice: message ?? "이메일 확인은 끝났지만 PactFive 계정 연결을 마치려면 소유권을 다시 확인해야 합니다.",
        tone: "info",
        alert: false,
      };
    case "sync-error":
      return {
        eyebrow: "계정 연결 필요",
        contextState: "로그인에서 계정 연결을 이어서 처리해야 합니다.",
        notice: `${message ?? "이메일 확인은 처리됐지만 계정 연결을 마치지 못했습니다."} 입력한 이메일로 로그인하면 안전하게 이어서 처리합니다.`,
        tone: "danger",
        alert: true,
      };
    case "context-conflict":
      return {
        eyebrow: "현재 계정 확인 필요",
        contextState: "현재 로그인 세션을 끝낸 뒤 같은 확인 요청을 계속할 수 있습니다.",
        notice: message ?? "현재 로그인 세션에서 먼저 로그아웃한 뒤 다시 시도해 주세요.",
        tone: "danger",
        alert: true,
      };
    case "rate-limited":
      return {
        eyebrow: "잠시 대기 필요",
        contextState: "확인 요청 제한이 끝나기를 기다리고 있습니다.",
        notice: message ?? "요청이 잠시 제한됐습니다. 안내된 시간이 지난 뒤 다시 시도해 주세요.",
        tone: "danger",
        alert: true,
      };
    case "retryable":
      return {
        eyebrow: "연결 지연",
        contextState: "계정 상태를 확정하지 못했습니다.",
        notice: message ?? "인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
        tone: "danger",
        alert: true,
      };
    case "error":
      return {
        eyebrow: "확인 중단",
        contextState: "계정 상태를 변경하지 못했습니다.",
        notice: message ?? "이메일 확인을 완료할 수 없습니다.",
        tone: "danger",
        alert: true,
      };
    case "ready":
    default:
      return {
        eyebrow: "사용자 동작 필요",
        contextState: "아직 계정과 세션을 만들지 않았습니다.",
        notice: "확인 링크를 안전하게 읽었습니다. 아직 서버에 확인 요청을 보내지 않았습니다.",
        tone: "info",
        alert: false,
      };
  }
}

export function EmailConfirmationScreen({
  phase,
  message,
  returnTo,
  onConfirm,
  onRetry,
  onContinue,
  onLogout,
  signingOut = false,
  retryAfterSeconds = 0,
}: EmailConfirmationScreenProps) {
  const copy = getScreenCopy(phase, message);
  const safeReturnTo = phase === "success" ? safeReturnToOrRoot(returnTo) : undefined;
  const isVerifying = phase === "verifying";
  const needsRecovery = phase === "recovery" || phase === "sync-error";
  const canRestart = phase === "missing" || phase === "expired" || phase === "error";

  return (
    <AuthFrame
      idPrefix="email-confirmation"
      eyebrow={copy.eyebrow}
      title="이메일 확인"
      description="링크를 여는 것만으로 가입을 완료하지 않습니다. 메일에서 시작한 요청이 맞다면 직접 확인을 완료해 주세요."
      contextTitle="이메일 확인을 안전하게 마무리합니다"
      contextDescription="링크를 여는 것만으로 가입을 완료하지 않습니다. 아래 확인 버튼을 누른 뒤 가입할 때 저장한 화면으로 돌아갑니다."
      contextState={copy.contextState}
      returnTo={safeReturnTo}
      returnCardTitle="확인 후 계속할 작업"
      preservedLabel="가입할 때 저장한 위치 보호됨"
    >
      <AuthNotice
        tone={copy.tone}
        role={copy.alert ? "alert" : "status"}
        focusKey={phase === "ready" || phase === "verifying" ? undefined : phase}
      >
        {copy.notice}
      </AuthNotice>

      {(phase === "ready" || isVerifying) && (
        <div className="pf-auth-actions">
          <button
            className="pf-auth-button pf-auth-button--primary"
            type="button"
            onClick={onConfirm}
            disabled={isVerifying}
            aria-busy={isVerifying}
          >
            {isVerifying && <span className="pf-auth-spinner" aria-hidden="true" />}
            {isVerifying ? "확인 중…" : "이메일 확인하기"}
          </button>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
        </div>
      )}

      {phase === "success" && (
        <div className="pf-auth-actions">
          <button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onContinue}>
            이전 작업 계속하기
          </button>
        </div>
      )}

      {phase === "retryable" && (
        <div className="pf-auth-actions">
          <button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onRetry}>
            다시 시도
          </button>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
        </div>
      )}

      {phase === "rate-limited" && (
        <div className="pf-auth-actions">
          <button
            className="pf-auth-button pf-auth-button--primary"
            type="button"
            onClick={onRetry}
            disabled={retryAfterSeconds > 0}
          >
            {retryAfterSeconds > 0 ? `${retryAfterSeconds}초 후 다시 시도` : "다시 시도"}
          </button>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
        </div>
      )}

      {phase === "unavailable" && (
        <div className="pf-auth-actions">
          <a className="pf-auth-button pf-auth-button--primary" href={AUTH_ROUTES.login}>로그인에서 계정 상태 확인</a>
        </div>
      )}

      {needsRecovery && (
        <div className="pf-auth-actions">
          <a className="pf-auth-button pf-auth-button--primary" href={AUTH_ROUTES.login}>로그인에서 가입 복구 시작</a>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.signUp}>회원가입 다시 시작</a>
        </div>
      )}

      {phase === "context-conflict" && (
        <div className="pf-auth-actions">
          <button
            className="pf-auth-button pf-auth-button--primary"
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {signingOut && <span className="pf-auth-spinner" aria-hidden="true" />}
            {signingOut ? "로그아웃 중…" : "현재 계정 로그아웃"}
          </button>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
        </div>
      )}

      {canRestart && (
        <div className="pf-auth-actions">
          <a className="pf-auth-button pf-auth-button--primary" href={AUTH_ROUTES.signUp}>회원가입 다시 시작</a>
          <a className="pf-auth-button pf-auth-button--quiet" href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
        </div>
      )}

      <p className="pf-auth-help pf-auth-flow-after">
        메일 보안 도구가 링크를 먼저 방문해도 이 버튼을 누르기 전에는 가입 상태가 바뀌지 않습니다.
        일회용 확인 값은 화면·로그·브라우저 저장소에 표시하거나 보관하지 않습니다.
      </p>
    </AuthFrame>
  );
}

export type EmailConfirmationPageProps = {
  tokenHash?: string | null;
  onNavigate?: (path: string) => void;
};

function navigateInBrowser(path: string): void {
  if (typeof window !== "undefined") window.location.assign(path);
}

export function EmailConfirmationPage({
  tokenHash,
  onNavigate = navigateInBrowser,
}: EmailConfirmationPageProps) {
  const { confirmEmail, logout } = useAuth({ restoreOnMount: false });
  const [phase, setPhase] = useState<EmailConfirmationPhase>(
    tokenHash && tokenHash.trim().length >= 8 ? "ready" : "missing",
  );
  const [message, setMessage] = useState<string | undefined>();
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const requestInFlight = useRef(false);
  const signOutInFlight = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);

  useEffect(() => {
    if (phase !== "rate-limited" || retryAfterSeconds <= 0) return undefined;
    const timeout = window.setTimeout(() => {
      setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [phase, retryAfterSeconds]);

  const submitConfirmation = async () => {
    if (!tokenHash || tokenHash.trim().length < 8 || requestInFlight.current) return;
    requestInFlight.current = true;
    setMessage(undefined);
    setRetryAfterSeconds(0);
    setPhase("verifying");
    try {
      const session = await confirmEmail(tokenHash);
      const safeReturnTo = safeReturnToOrRoot(session.returnTo);
      setReturnTo(safeReturnTo);
      setPhase("success");
    } catch (error) {
      const failure = classifyEmailConfirmationFailure(error);
      setMessage(failure.message);
      setRetryAfterSeconds(failure.retryAfterSeconds ?? 0);
      setPhase(failure.phase);
    } finally {
      requestInFlight.current = false;
    }
  };

  const endCurrentSession = async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    try {
      await logout();
      setMessage(undefined);
      setRetryAfterSeconds(0);
      setPhase("ready");
    } catch {
      setMessage("로그아웃 요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      setPhase("context-conflict");
    } finally {
      signOutInFlight.current = false;
      setSigningOut(false);
    }
  };

  return (
    <EmailConfirmationScreen
      phase={phase}
      message={message}
      returnTo={returnTo}
      onConfirm={() => { void submitConfirmation(); }}
      onRetry={() => { void submitConfirmation(); }}
      onContinue={() => navigateOnce(safeReturnToOrRoot(returnTo))}
      onLogout={() => { void endCurrentSession(); }}
      signingOut={signingOut}
      retryAfterSeconds={retryAfterSeconds}
    />
  );
}
