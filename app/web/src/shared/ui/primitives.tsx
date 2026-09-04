/**
 * 공용 UI 조각 — 시안(`features/{기능}/design/`)의 클래스를 그대로 쓴다.
 *
 * 원본: features/project-management/prototype/web/ui.tsx ·
 *       features/engagement/prototype/web/ui.tsx (3e4977e)
 *       그리고 두 기능의 design/_tokens.css · high-fi-*.html
 *
 * 2026-08-28 2차: 1차 반영에서 프로토타입 컴포넌트만 보고 자체 클래스를 만들어 시안과
 * 갈라졌다. 시안이 화면 구조의 정본이므로(app/web/AGENTS.md "무엇이 무엇의 정본인가")
 * 클래스 이름과 마크업을 시안에 맞춰 다시 짰다. 변형만 BEM 으로 바꿨다
 * (`.btn.primary` → `.btn--primary`, docs/naming-convention.md §5).
 *
 * 값은 `tokens.css` 의 CSS 변수를 쓴다. 원시 값을 여기 적지 않는다.
 */

import type { ReactNode } from 'react';

/* ─────────────── design-tokens.md §3 과 같은 타입 ─────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
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
  /**
   * 보이는 글자와 다른 것을 읽어 줘야 할 때만 쓴다 (2026-09-03 추가 — CR-0010).
   * 막힌 버튼의 사유처럼, 화면에 보이는 문구만으로 접근성이 충족되지 않는 경우에 쓴다.
   */
  ariaLabel?: string;
  /** 마우스 사용자용 보조 설명. 이것만으로는 접근성이 충족되지 않는다 — `ariaLabel` 과 함께 쓴다 */
  title?: string;
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
  ariaLabel,
  title,
  children,
}: ButtonProps) {
  const sizeClass = size === 'md' ? '' : ` btn--${size}`;
  return (
    <button
      type={type}
      className={`btn btn--${variant}${sizeClass}${fullWidth ? ' btn--full' : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * 라벨 + 입력 한 벌. 시안의 `.field-row` > `.label` + `.field` 구조를 따른다.
 *
 * 입력 요소에 `className="field"` 를 붙이는 것은 호출부의 몫이다 — input·textarea·select 를
 * 자유롭게 쓰되 클래스만 맞추면 된다.
 */
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
    <div className={`field-row${state === 'error' ? ' field-row--error' : ''}`}>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {helperText && (
        <p className="helper" id={`${id}-help`}>
          {helperText}
        </p>
      )}
      {state === 'error' && errorMessage && (
        // 색 하나로만 구분하지 않는다 (§12 금지 패턴). 문구와 role 을 함께 쓴다.
        <p className="field-error" id={`${id}-error`} role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

/* ─────────────── 배지 ─────────────── */

/**
 * 모집 상태 배지. 라벨과 색조는 시안의 `.badge.open|scheduled|closed` 를 따른다.
 * 화면마다 다르게 부르면 같은 상태가 다른 말로 보인다.
 */
const RECRUITMENT_PRESENTATION = {
  SCHEDULED: { label: '모집 예정', modifier: 'scheduled' },
  OPEN: { label: '모집 중', modifier: 'open' },
  CLOSED: { label: '모집 마감', modifier: 'closed' },
} as const;

export type RecruitmentStatus = keyof typeof RECRUITMENT_PRESENTATION;

export function RecruitmentBadge({ status }: { status: RecruitmentStatus }) {
  const presentation = RECRUITMENT_PRESENTATION[status];
  return <span className={`badge badge--${presentation.modifier}`}>{presentation.label}</span>;
}

/**
 * 거래 상태 배지.
 *
 * **이 배지는 내 프로젝트(SCR-B07)·내 지원 현황에만 나온다.** 공개 목록·상세에는 나오지
 * 않는다 (spec.md 규칙 9 · design/high-fi-manage.html 의 주석). `NONE` 은 보여줄 것이 없어
 * 아무것도 그리지 않는다.
 */
const TRANSACTION_PRESENTATION = {
  CONTRACT_PENDING: { label: '계약 대기', modifier: 'reopen' },
  IN_PROGRESS: { label: '작업 중', modifier: 'scheduled' },
  COMPLETED: { label: '완료', modifier: 'open' },
  CANCELED: { label: '취소됨', modifier: 'canceled' },
} as const;

export type TransactionStatus = keyof typeof TRANSACTION_PRESENTATION | 'NONE';

export function TransactionBadge({ status }: { status: TransactionStatus }) {
  if (status === 'NONE') return null;
  const presentation = TRANSACTION_PRESENTATION[status];
  return <span className={`badge badge--${presentation.modifier}`}>{presentation.label}</span>;
}

/** 재모집 가능 배지 — 시안 SCR-B07 의 `.badge.reopen` */
export function ReopenBadge() {
  return <span className="badge badge--reopen">재모집 가능</span>;
}

/** 기술 태그처럼 상태가 아닌 값을 나열할 때 쓴다 — 상태 배지와 모양을 나눈다 */
export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>;
}

/* ─────────────── 값 표시 ─────────────── */

/**
 * 마감까지 남은 기간. **절대 날짜와 상대 기한을 함께 준다** (도메인 패턴 DeadlineIndicator).
 * 상대 표기만 있으면 "5일 전"이 언제인지 알 수 없다.
 *
 * 카드 하단(`.pcard__foot`)처럼 좁은 자리에서는 `compact` 로 상대 표기만 쓴다 — 시안이
 * 그 자리에 "마감 5일 전" 한 덩이만 두었다.
 */
export function DeadlineIndicator({
  deadlineAt,
  now,
  compact = false,
}: {
  deadlineAt: string;
  now?: string;
  compact?: boolean;
}) {
  const reference = now ? new Date(now).getTime() : Date.now();
  const days = Math.ceil((new Date(deadlineAt).getTime() - reference) / (24 * 60 * 60 * 1000));
  const relative = days <= 0 ? '오늘 마감' : `마감 ${days}일 전`;
  if (compact) return <span>{relative}</span>;

  const absolute = deadlineAt.slice(0, 10).replace(/-/g, '.');
  return (
    <span>
      <strong>{relative}</strong> <span className="caption">{absolute}</span>
    </span>
  );
}

export function Money({ amount }: { amount: number }) {
  // 예산은 비교 대상이라 자릿수를 맞춘다 (§11)
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{amount.toLocaleString('ko-KR')}원</span>;
}

/* ─────────────── 안내 · 빈 상태 ─────────────── */

export type NoticeTone = 'info' | 'warning' | 'danger';

/** 화면 위쪽에 까는 안내 배너. 시안의 `.notice.info|warning|danger` */
export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <p className={`notice notice--${tone}`} role={tone === 'info' ? 'status' : 'alert'}>
      {children}
    </p>
  );
}

/**
 * 결과가 0건일 때. 빈 화면을 그냥 두지 않는다.
 * 시안(SCR-B01·B07·B08)이 전부 제목 + 설명 + 행동 하나 구조다.
 */
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
      <p className="title">{title}</p>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

/* ─────────────── 행동 ─────────────── */

/**
 * 서버가 허용한 행동만 보여준다 (도메인 패턴 PermissionAwareActions).
 *
 * **막힌 행동은 숨기지 않고 이유를 붙인다** — 버튼이 사라지면 왜 못 하는지 알 수 없다.
 * 시안 SCR-B07 은 행 오른쪽에 버튼만 늘어놓지만, 그건 "허용된 것만" 그린 상태다.
 *
 * 사유를 **두 경로로** 전한다 (2026-09-03 추가 — CR-0010, feedback_loop 2026-08-28
 * project-management 항목 5).
 *
 * - 바깥 `<span title=…>` — 마우스 사용자용. 버튼이 `disabled` 면 포인터 이벤트를 못 받아
 *   `title` 이 안 뜨는 브라우저가 있어, 버튼을 감싸는 span 에 둔다.
 * - `Button` 의 `ariaLabel` — 키보드·보조 기술용. `title` 은 이 경로에 전달되지 않는다.
 *
 * 눈으로 보든 읽어 주든 같은 이유를 듣게 한다.
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
    <div className="row__acts">
      {actions.map((action) => (
        <span key={action.id} title={!action.available ? action.blockedReason : undefined}>
          <Button
            variant={action.variant ?? 'secondary'}
            size="sm"
            disabled={!action.available}
            onClick={action.onClick}
            ariaLabel={
              !action.available && action.blockedReason
                ? `${action.label} — ${action.blockedReason}`
                : undefined
            }
          >
            {action.label}
          </Button>
        </span>
      ))}
    </div>
  );
}
