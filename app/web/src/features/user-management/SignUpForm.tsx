import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Field, Notice } from '../../shared/ui/primitives';
import { AUTH_ROUTES } from './auth.routes';
import { safeReturnToOrRoot } from './return-to';
import { createReturnNavigator, useAuth } from './useAuth';
import type { UserRole } from './auth.types';

/**
 * 원본(`features/user-management/prototype/web/SignUpForm.tsx`)을 재해석했다 — 원본은
 * `AuthFrame`/`AuthNotice`라는 이 기능 전용 프레젠테이션 컴포넌트를 썼지만, `LoginForm.tsx`가
 * 이미 `shared/ui`(Field·Button·Notice·PageBody)로 통일해 둔 상태라 여기서도 같은 원칙을
 * 따랐다(app/web/AGENTS.md "재해석해서 일관되게 다시 짠다"). 시각적 카드 레이아웃(역할 선택
 * 두 칸 그리드 등)은 옮기지 않고 `field-row` 안의 단순 라디오 목록으로 줄였다 — 동작(검증·
 * 상태 전이·OAuth·재전송·복구)은 원본과 동일하게 옮겼다.
 *
 * `mode="recovery"`는 로그인 화면에서 REGISTRATION_COMPLETION_REQUIRED를 받았을 때만 오는
 * 경로다(`LoginForm.tsx`의 "가입 완료하기" 링크, `?mode=recovery`). 이 화면은 그 값을 그대로
 * 믿고 폼을 다르게 그린다 — 재검증하지 않는다(서버가 이미 최종 판정한다).
 */

export type SignUpMode = 'register' | 'recovery';

type SignUpDraft = { role: UserRole | null; name: string; email: string; password: string };
type SignUpFieldErrors = Partial<Record<keyof SignUpDraft, string>>;

function validateSignUpDraft(draft: SignUpDraft): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  if (!draft.role) errors.role = '의뢰인 또는 프리랜서 중 역할을 선택해 주세요.';
  if (!draft.name.trim()) errors.name = '이름을 입력해 주세요.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = '올바른 이메일 주소를 입력해 주세요.';
  }
  if (draft.password.length < 8) errors.password = '비밀번호를 8자 이상 입력해 주세요.';
  return errors;
}

function hasErrors(errors: SignUpFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

const initialDraft: SignUpDraft = { role: null, name: '', email: '', password: '' };

type ResendState =
  | { status: 'idle'; message: null }
  | { status: 'submitting'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const initialResendState: ResendState = { status: 'idle', message: null };

export type SignUpFormProps = {
  mode?: SignUpMode;
  returnTo?: string;
  onNavigate?: (path: string) => void;
};

export function SignUpForm({ mode = 'register', returnTo = '/', onNavigate = () => undefined }: SignUpFormProps) {
  const { state, register, completeRegistration, startOAuth, resendConfirmation, logout } = useAuth({
    restoreOnMount: false,
  });
  const [draft, setDraft] = useState<SignUpDraft>(initialDraft);
  const [errors, setErrors] = useState<SignUpFieldErrors>({});
  const [accepted, setAccepted] = useState(false);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [resendState, setResendState] = useState<ResendState>(initialResendState);
  const [endingSession, setEndingSession] = useState(false);

  const safeReturnTo = useMemo(() => safeReturnToOrRoot(returnTo), [returnTo]);
  const navigateOnce = useMemo(() => createReturnNavigator(onNavigate), [onNavigate]);
  const isRecovery = mode === 'recovery';
  const isBusy = state.status === 'submitting' || state.status === 'authenticated' || endingSession;
  const stateMessage = state.status === 'anonymous' || state.status === 'retryable' ? state.message : null;

  useEffect(() => {
    if (state.status === 'authenticated') navigateOnce(safeReturnToOrRoot(state.session.returnTo));
  }, [navigateOnce, state]);

  function update<K extends keyof SignUpDraft>(field: K, value: SignUpDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next = validateSignUpDraft(draft);
    setErrors(next);
    return !hasErrors(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        navigateOnce(safeReturnToOrRoot(session.returnTo));
        return;
      }
      const response = await register(input);
      setDraft((current) => ({ ...current, password: '' }));
      setAcceptedMessage(response.message);
      setResendState(initialResendState);
      setAccepted(true);
    } catch {
      // useAuth가 계약 오류를 화면 상태로 변환한다.
    }
  }

  async function handleOAuth(provider: 'GOOGLE' | 'KAKAO') {
    if (!draft.role) {
      setErrors((current) => ({ ...current, role: '소셜 가입을 계속하려면 먼저 역할을 선택해 주세요.' }));
      return;
    }
    try {
      await startOAuth(provider, safeReturnTo, draft.role);
    } catch {
      // useAuth가 오류 상태를 표시한다.
    }
  }

  async function handleResend() {
    setResendState({ status: 'submitting', message: '확인 메일 재전송을 요청하고 있습니다.' });
    try {
      await resendConfirmation(draft.email.trim());
      setResendState({
        status: 'success',
        message: '재전송 요청을 접수했습니다. 받은편지함과 스팸함을 확인해 주세요.',
      });
    } catch {
      setResendState({
        status: 'error',
        message: '재전송 요청을 완료할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
      });
    }
  }

  function handleEditEmail() {
    setAccepted(false);
    setAcceptedMessage(null);
    setResendState(initialResendState);
    setErrors({});
  }

  async function handleConflictingSessionLogout() {
    setEndingSession(true);
    try {
      await logout();
    } finally {
      setEndingSession(false);
    }
  }

  const loginHref = `${AUTH_ROUTES.login}?returnTo=${encodeURIComponent(safeReturnTo)}`;

  if (accepted) {
    const resendBusy = resendState.status === 'submitting';
    return (
      <PageBody narrow>
        <header>
          <p className="caption">다음 단계 안내</p>
          <h1 className="h3">가입 요청을 접수했습니다</h1>
        </header>
        <Notice tone="info">
          {acceptedMessage || '가입 가능한 경우 입력한 이메일로 확인 안내를 보냈습니다.'}
        </Notice>
        <p className="helper">
          메일 링크를 여는 것만으로 가입이 완료되지 않습니다. 확인 화면에서 직접 계속해야 계정과
          세션이 만들어집니다. 계정 존재 여부를 보호하기 위해 모든 요청에 같은 안내를 표시합니다.
        </p>
        {resendState.status !== 'idle' && (
          <Notice tone={resendState.status === 'error' ? 'danger' : 'info'}>{resendState.message}</Notice>
        )}
        <div className="btn-row" style={{ flexWrap: 'wrap', marginTop: 16 }}>
          <Button variant="secondary" disabled={resendBusy} loading={resendBusy} onClick={() => void handleResend()}>
            {resendState.status === 'error' ? '확인 메일 다시 요청하기' : '확인 메일 다시 보내기'}
          </Button>
          <Button variant="quiet" disabled={resendBusy} onClick={handleEditEmail}>
            이메일 주소 수정하기
          </Button>
          <a href={loginHref}>로그인으로 돌아가기</a>
        </div>
      </PageBody>
    );
  }

  const roleField = (
    <fieldset className="field-row" aria-invalid={Boolean(errors.role)}>
      <legend className="label">이용 역할</legend>
      <p className="helper">가입 완료 후에는 역할을 변경할 수 없습니다.</p>
      <div className="btn-row" style={{ flexWrap: 'wrap' }}>
        {(
          [
            ['CLIENT', '의뢰인 — 프로젝트를 등록하고 전문가와 협업합니다.'],
            ['FREELANCER', '프리랜서 — 프로젝트를 찾아 지원하고 작업합니다.'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="btn btn--secondary" style={{ cursor: 'pointer' }}>
            <input
              type="radio"
              name="role"
              value={value}
              checked={draft.role === value}
              onChange={() => update('role', value)}
              disabled={isBusy}
              required
              style={{ marginRight: 8 }}
            />
            {label}
          </label>
        ))}
      </div>
      {errors.role && (
        <p className="field-error" role="alert">
          {errors.role}
        </p>
      )}
    </fieldset>
  );

  return (
    <PageBody narrow>
      <header>
        <p className="caption">{isRecovery ? '계정 소유권 다시 확인' : '안전한 계정 만들기'}</p>
        <h1 className="h3">{isRecovery ? '가입 완료하기' : '회원가입'}</h1>
        <p className="helper">
          {isRecovery
            ? '같은 이메일과 비밀번호로 소유권을 확인하고 가입 정보를 다시 입력해 주세요.'
            : '가입할 때는 계정과 역할만 정합니다. 상세 프로필은 실제로 필요한 순간에 이어서 입력합니다.'}
        </p>
      </header>

      {isRecovery && (
        <Notice tone="info">
          이 화면은 로그인에서 계정 소유권을 확인한 뒤에만 사용할 수 있습니다. 실패해도 수정 가능한
          입력과 돌아갈 위치는 유지됩니다.
        </Notice>
      )}
      {stateMessage && <Notice tone="danger">{stateMessage}</Notice>}
      {state.status === 'anonymous' && state.action === 'LOGOUT' && (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <Button variant="secondary" disabled={isBusy} onClick={() => void handleConflictingSessionLogout()}>
            현재 계정 로그아웃
          </Button>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} aria-busy={isBusy}>
        {isRecovery ? (
          <>
            <Field id="sign-up-email" label="이메일" required>
              <input
                id="sign-up-email"
                className="field"
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => update('email', event.target.value)}
                disabled={isBusy}
                required
              />
            </Field>
            <Field id="sign-up-password" label="비밀번호" required helperText="8자 이상 입력해 주세요.">
              <input
                id="sign-up-password"
                className="field"
                type="password"
                autoComplete="current-password"
                value={draft.password}
                onChange={(event) => update('password', event.target.value)}
                disabled={isBusy}
                minLength={8}
                required
              />
            </Field>
            <Field id="sign-up-name" label="이름" required>
              <input
                id="sign-up-name"
                className="field"
                autoComplete="name"
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                disabled={isBusy}
                required
              />
            </Field>
            {roleField}
          </>
        ) : (
          <>
            {roleField}
            <div className="btn-row" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
              <Button variant="secondary" disabled={isBusy} onClick={() => void handleOAuth('GOOGLE')}>
                Google로 계속하기
              </Button>
              <Button variant="secondary" disabled={isBusy} onClick={() => void handleOAuth('KAKAO')}>
                Kakao로 계속하기
              </Button>
            </div>
            <p className="caption">또는 이메일로 가입</p>
            <Field id="sign-up-name" label="이름" required errorMessage={errors.name} state={errors.name ? 'error' : 'default'}>
              <input
                id="sign-up-name"
                className="field"
                autoComplete="name"
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
                disabled={isBusy}
                required
              />
            </Field>
            <Field id="sign-up-email" label="이메일" required errorMessage={errors.email} state={errors.email ? 'error' : 'default'}>
              <input
                id="sign-up-email"
                className="field"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={draft.email}
                onChange={(event) => update('email', event.target.value)}
                disabled={isBusy}
                required
              />
            </Field>
            <Field
              id="sign-up-password"
              label="비밀번호"
              required
              helperText="8자 이상 입력해 주세요."
              errorMessage={errors.password}
              state={errors.password ? 'error' : 'default'}
            >
              <input
                id="sign-up-password"
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder="비밀번호 8자 이상"
                value={draft.password}
                onChange={(event) => update('password', event.target.value)}
                disabled={isBusy}
                minLength={8}
                required
              />
            </Field>
          </>
        )}

        <Button variant="primary" type="submit" fullWidth disabled={isBusy} loading={isBusy}>
          {isRecovery ? '가입 완료하기' : '확인 메일 받기'}
        </Button>
      </form>

      <p className="helper">
        이미 계정이 있나요? <a href={loginHref}>로그인</a>
      </p>
    </PageBody>
  );
}
