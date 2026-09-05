import { useMemo, useRef, useState } from 'react';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Notice } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { AUTH_ROUTES } from './auth.routes';
import { safeReturnToOrRoot } from './return-to';
import { createReturnNavigator, useAuth } from './useAuth';

/**
 * 원본(`features/user-management/prototype/web/EmailConfirmationPage.tsx`)을 재해석했다 —
 * `AuthFrame`/`AuthNotice` 대신 `shared/ui`(PageBody·Button·Notice)를 쓴다(SignUpForm.tsx와
 * 같은 원칙). 단계(phase) 상태 기계와 오류 코드 분류는 원본 그대로 옮겼다.
 *
 * 한 가지 줄인 것 — 원본은 `AuthApiError.retryAfterSeconds`(서버 `Retry-After` 헤더를 파싱한 값)로
 * 429 응답에 카운트다운을 보여준다. `shared/http.ts`의 `ApiError`는 이 헤더를 파싱하지 않는다
 * (2026-09-05 기준 다른 기능도 이 값을 쓴 적이 없다) — 그래서 카운트다운 없이 고정 안내 문구만
 * 보여준다. 필요해지면 `shared/http.ts`에 헤더 파싱을 추가하고 여기서 이어받는다.
 */

export type EmailConfirmationPhase =
  | 'missing'
  | 'ready'
  | 'verifying'
  | 'success'
  | 'expired'
  | 'unavailable'
  | 'recovery'
  | 'context-conflict'
  | 'rate-limited'
  | 'retryable'
  | 'sync-error'
  | 'error';

type ConfirmationFailure = {
  phase: Exclude<EmailConfirmationPhase, 'missing' | 'ready' | 'verifying' | 'success'>;
  message: string;
};

function classifyEmailConfirmationFailure(error: unknown): ConfirmationFailure {
  if (!(error instanceof ApiError)) {
    return { phase: 'retryable', message: '잠시 후 다시 시도해 주세요.' };
  }
  if (error.code === 'REGISTRATION_COMPLETION_REQUIRED') {
    return {
      phase: 'recovery',
      message: '이메일 확인은 끝났지만 PactFive 계정 연결을 마치려면 소유권을 다시 확인해야 합니다.',
    };
  }
  if (error.code === 'AUTH_SESSION_SYNC_FAILED') {
    return { phase: 'sync-error', message: '이메일 확인은 처리됐지만 계정 연결을 마치지 못했습니다.' };
  }
  if (error.code === 'EMAIL_CONFIRMATION_INVALID' || error.code === 'EMAIL_CONFIRMATION_EXPIRED') {
    return { phase: 'expired', message: '확인 링크가 유효하지 않거나 만료됐습니다.' };
  }
  if (error.code === 'EMAIL_CONFIRMATION_NOT_AVAILABLE') {
    return {
      phase: 'unavailable',
      message: '이 확인 요청을 완료할 수 없습니다. 계정 상태는 로그인에서 다시 확인해 주세요.',
    };
  }
  if (error.status === 429) {
    return { phase: 'rate-limited', message: '요청이 잠시 제한됐습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (error.code === 'AUTH_PROVIDER_UNAVAILABLE' || (error.status >= 500 && error.status <= 599)) {
    return { phase: 'retryable', message: '인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }
  if (error.code === 'AUTH_CONTEXT_CONFLICT') {
    return { phase: 'context-conflict', message: '현재 로그인 세션에서 먼저 로그아웃한 뒤 다시 시도해 주세요.' };
  }
  return { phase: 'error', message: '이메일 확인을 완료할 수 없습니다.' };
}

type ScreenCopy = { title: string; notice: string; tone: 'info' | 'warning' | 'danger' };

function getScreenCopy(phase: EmailConfirmationPhase, message?: string): ScreenCopy {
  switch (phase) {
    case 'missing':
      return {
        title: '확인 링크 필요',
        notice: '확인 링크가 없거나 올바르지 않습니다. 메일의 링크를 다시 열거나 회원가입을 다시 시작해 주세요.',
        tone: 'danger',
      };
    case 'verifying':
      return { title: '확인 처리 중', notice: '이메일 확인과 계정 연결을 안전하게 처리하고 있습니다.', tone: 'info' };
    case 'success':
      return { title: '확인 완료', notice: '이메일 확인을 완료했습니다. 가입할 때 저장한 화면으로 이동할 수 있습니다.', tone: 'info' };
    case 'expired':
      return { title: '새 확인 링크 필요', notice: message ?? '확인 링크가 유효하지 않거나 만료됐습니다.', tone: 'danger' };
    case 'unavailable':
      return { title: '로그인에서 확인 필요', notice: message ?? '이 확인 요청을 완료할 수 없습니다.', tone: 'danger' };
    case 'recovery':
      return {
        title: '가입 복구 필요',
        notice: message ?? '이메일 확인은 끝났지만 계정 연결을 마치려면 소유권을 다시 확인해야 합니다.',
        tone: 'warning',
      };
    case 'sync-error':
      return {
        title: '계정 연결 필요',
        notice: `${message ?? '이메일 확인은 처리됐지만 계정 연결을 마치지 못했습니다.'} 입력한 이메일로 로그인하면 이어서 처리합니다.`,
        tone: 'danger',
      };
    case 'context-conflict':
      return { title: '현재 계정 확인 필요', notice: message ?? '현재 로그인 세션에서 먼저 로그아웃한 뒤 다시 시도해 주세요.', tone: 'danger' };
    case 'rate-limited':
      return { title: '잠시 대기 필요', notice: message ?? '요청이 잠시 제한됐습니다. 잠시 후 다시 시도해 주세요.', tone: 'warning' };
    case 'retryable':
      return { title: '연결 지연', notice: message ?? '인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.', tone: 'danger' };
    case 'error':
      return { title: '확인 중단', notice: message ?? '이메일 확인을 완료할 수 없습니다.', tone: 'danger' };
    case 'ready':
    default:
      return { title: '이메일 확인', notice: '확인 링크를 안전하게 읽었습니다. 아직 서버에 확인 요청을 보내지 않았습니다.', tone: 'info' };
  }
}

export type EmailConfirmationPageProps = {
  tokenHash?: string | null;
  onNavigate?: (path: string) => void;
};

function navigateInBrowser(path: string): void {
  if (typeof window !== 'undefined') window.location.assign(path);
}

export function EmailConfirmationPage({ tokenHash, onNavigate = navigateInBrowser }: EmailConfirmationPageProps) {
  const { confirmEmail, logout } = useAuth({ restoreOnMount: false });
  const [phase, setPhase] = useState<EmailConfirmationPhase>(
    tokenHash && tokenHash.trim().length >= 8 ? 'ready' : 'missing',
  );
  const [message, setMessage] = useState<string | undefined>();
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const requestInFlight = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);

  async function submitConfirmation() {
    if (!tokenHash || tokenHash.trim().length < 8 || requestInFlight.current) return;
    requestInFlight.current = true;
    setMessage(undefined);
    setPhase('verifying');
    try {
      const session = await confirmEmail(tokenHash);
      setReturnTo(safeReturnToOrRoot(session.returnTo));
      setPhase('success');
    } catch (error) {
      const failure = classifyEmailConfirmationFailure(error);
      setMessage(failure.message);
      setPhase(failure.phase);
    } finally {
      requestInFlight.current = false;
    }
  }

  async function endCurrentSession() {
    setSigningOut(true);
    try {
      await logout();
      setMessage(undefined);
      setPhase('ready');
    } catch {
      setMessage('로그아웃 요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.');
      setPhase('context-conflict');
    } finally {
      setSigningOut(false);
    }
  }

  const copy = getScreenCopy(phase, message);
  const isVerifying = phase === 'verifying';
  const needsRecovery = phase === 'recovery' || phase === 'sync-error';
  const canRestart = phase === 'missing' || phase === 'expired' || phase === 'error';

  return (
    <PageBody narrow>
      <header>
        <p className="caption">확인 후 계속할 작업</p>
        <h1 className="h3">{copy.title}</h1>
      </header>

      <Notice tone={copy.tone}>{copy.notice}</Notice>

      <div className="btn-row" style={{ flexWrap: 'wrap', marginTop: 16 }}>
        {(phase === 'ready' || isVerifying) && (
          <>
            <Button variant="primary" disabled={isVerifying} loading={isVerifying} onClick={() => void submitConfirmation()}>
              이메일 확인하기
            </Button>
            <a href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
          </>
        )}

        {phase === 'success' && (
          <Button variant="primary" onClick={() => navigateOnce(safeReturnToOrRoot(returnTo))}>
            이전 작업 계속하기
          </Button>
        )}

        {(phase === 'retryable' || phase === 'rate-limited') && (
          <>
            <Button variant="primary" onClick={() => void submitConfirmation()}>
              다시 시도
            </Button>
            <a href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
          </>
        )}

        {phase === 'unavailable' && <a href={AUTH_ROUTES.login}>로그인에서 계정 상태 확인</a>}

        {needsRecovery && (
          <>
            <a href={AUTH_ROUTES.login}>로그인에서 가입 복구 시작</a>
            <a href={AUTH_ROUTES.signUp}>회원가입 다시 시작</a>
          </>
        )}

        {phase === 'context-conflict' && (
          <>
            <Button variant="primary" disabled={signingOut} loading={signingOut} onClick={() => void endCurrentSession()}>
              현재 계정 로그아웃
            </Button>
            <a href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
          </>
        )}

        {canRestart && (
          <>
            <a href={AUTH_ROUTES.signUp}>회원가입 다시 시작</a>
            <a href={AUTH_ROUTES.login}>로그인으로 돌아가기</a>
          </>
        )}
      </div>

      <p className="helper">
        메일 보안 도구가 링크를 먼저 방문해도 이 버튼을 누르기 전에는 가입 상태가 바뀌지 않습니다.
      </p>
    </PageBody>
  );
}
