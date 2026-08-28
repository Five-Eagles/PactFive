/**
 * 공용 UI 조각 — `design-system/design-tokens.md` 가 정본이다.
 *
 * 원본: features/project-management/prototype/web/ui.tsx ·
 *       features/engagement/prototype/web/ui.tsx (3e4977e)
 *
 * 두 기능이 거의 같은 파일을 각자 들고 있었다. 통합하면서 `shared/ui/` 로 한 벌만 남겼다 —
 * 기능 폴더끼리 서로 import 하지 못하므로(app/web/AGENTS.md "폴더 간 접점") 공유하려면
 * 여기로 올려야 한다. 두 원본의 차이는 아래처럼 정리했다:
 *
 * - `EmptyState` — engagement 쪽이 title·body·action 3분할로 더 자세하다. 그쪽을 택했다.
 *   project-management 쪽 한 줄짜리 호출은 title 만 넘기면 그대로 동작한다.
 * - `Chip` — engagement 에만 있었다. 기술 태그 표시에 두 기능 모두 쓰므로 가져왔다.
 *
 * 값은 `tokens.css` 의 CSS 변수를 쓴다. 원시 값(#0B132B 같은 것)을 여기 적지 않는다.
 * feedback_loop/2026-08-28/engagement.md 항목 2 참고.
 */

import type { ReactNode } from 'react';

/* ─────────────── design-tokens.md §3 과 같은 타입 ─────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type FieldState = 'default' | 'filled' | 'error' | 'success' | 'disabled' | 'readOnly';

export type ButtonProps = {
  variant: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  /** 중복 실행을 막는다 (design-tokens.md §9) */
  loading?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children: ReactNode;
};

export function Button({
  variant,
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${fullWidth ? ' btn--full' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type FieldProps = {
  label: string;
  /** 라벨과 입력을 잇는다. 접근성 기준상 필수다 (design-tokens.md §10) */
  id: string;
  state?: FieldState;
  helperText?: string;
  errorMessage?: string;
  required?: boolean;
  children: ReactNode;
};

export function Field({
  label,
  id,
  state = 'default',
  helperText,
  errorMessage,
  required = false,
  children,
}: FieldProps) {
  const describedBy = [
    helperText ? `${id}-help` : null,
    state === 'error' && errorMessage ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`field field--${state}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {helperText && (
        <p className="field__help" id={`${id}-help`}>
          {helperText}
        </p>
      )}
      {state === 'error' && errorMessage && (
        // 색 하나로만 구분하지 않는다 (§12 금지 패턴). 문구와 role 을 함께 쓴다.
        <p className="field__error" id={`${id}-error`} role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

export type BadgeProps = { tone: FeedbackTone; label: string };

export function Badge({ tone, label }: BadgeProps) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

/** 기술 태그처럼 상태가 아닌 값을 나열할 때 쓴다 — 상태 배지와 섞이지 않게 모양을 나눈다 */
export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>;
}

/**
 * 모집 상태 배지. 라벨과 색조는 design-tokens.md 의 `statusPresentation` 을 따른다.
 * 화면마다 다르게 부르면 같은 상태가 다른 말로 보인다.
 */
const RECRUITMENT_PRESENTATION = {
  SCHEDULED: { label: '모집 예정', tone: 'info' },
  OPEN: { label: '모집 중', tone: 'success' },
  CLOSED: { label: '모집 마감', tone: 'neutral' },
} as const;

export type RecruitmentStatus = keyof typeof RECRUITMENT_PRESENTATION;

export function RecruitmentBadge({ status }: { status: RecruitmentStatus }) {
  const presentation = RECRUITMENT_PRESENTATION[status];
  return <Badge tone={presentation.tone} label={presentation.label} />;
}

/**
 * 마감까지 남은 기간. **절대 날짜와 상대 기한을 함께 준다** (도메인 패턴 DeadlineIndicator).
 * 상대 표기만 있으면 "5일 전"이 언제인지 알 수 없다.
 */
export function DeadlineIndicator({ deadlineAt, now }: { deadlineAt: string; now?: string }) {
  const reference = now ? new Date(now).getTime() : Date.now();
  const days = Math.ceil((new Date(deadlineAt).getTime() - reference) / (24 * 60 * 60 * 1000));
  const relative = days <= 0 ? '오늘 마감' : `마감 ${days}일 전`;
  const absolute = deadlineAt.slice(0, 10).replace(/-/g, '.');
  return (
    <span className="deadline">
      <strong>{relative}</strong> <span className="deadline__date">{absolute}</span>
    </span>
  );
}

export function Money({ amount }: { amount: number }) {
  // tabular 숫자로 자릿수를 맞춘다 (§11 — 예산은 비교 대상이다)
  return <span className="money">{amount.toLocaleString('ko-KR')}원</span>;
}

/** 결과가 0건일 때. 빈 화면을 그냥 두지 않는다 (Foundation: EmptyState) */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty" role="status">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

/**
 * 서버가 허용한 행동만 보여준다 (도메인 패턴 PermissionAwareActions).
 * **막힌 행동은 숨기지 않고 이유를 붙인다** — 버튼이 사라지면 왜 못 하는지 알 수 없다.
 */
export type ActionSpec = {
  id: string;
  label: string;
  available: boolean;
  blockedReason?: string;
  variant?: ButtonVariant;
  onClick?: () => void;
};

export function PermissionAwareActions({ actions }: { actions: ActionSpec[] }) {
  return (
    <div className="actions">
      {actions.map((action) => (
        <span key={action.id} className="actions__item">
          <Button
            variant={action.variant ?? 'secondary'}
            disabled={!action.available}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
          {!action.available && action.blockedReason && (
            <span className="actions__reason">{action.blockedReason}</span>
          )}
        </span>
      ))}
    </div>
  );
}
