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

/* ─────────────── Skeleton (design-tokens.md §14, ADR-0018, 2026-09-14 추가) ─────────────── */

export type SkeletonShape = 'line' | 'row' | 'card' | 'field' | 'pill' | 'button';

/**
 * 로딩 중 자리 하나. 장식용이라 스크린리더에서 숨긴다 — "불러오는 중" 안내는 이 상자를
 * 감싸는 `SkeletonStack`/`SkeletonList`의 `role="status"` + `sr-only` 텍스트가 맡는다.
 *
 * 클래스 접두어가 `ui-skeleton`인 이유 — `features/contracts-payments/panel.css`가 이미
 * bare `.skeleton`을 쓰고 있어(그 기능은 의도적으로 이 파일을 쓰지 않는다), 이름이 겹치지
 * 않게 접두어를 붙였다(tokens.css 해당 절 주석 참고).
 */
export function Skeleton({ shape, width }: { shape: SkeletonShape; width?: string }) {
  return (
    <div
      className={`ui-skeleton ui-skeleton--${shape}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * 상세·패널·폼처럼 콘텐츠 하나를 글줄(또는 필드) 여러 개로 흉내 낼 때 쓴다.
 * `widths`로 줄마다 폭을 다르게 주면 실제 문단처럼 보인다 — 전부 100%로 두면 "줄이 아니라
 * 그냥 회색 띠"처럼 보여 콘텐츠 흉내라는 목적이 흐려진다(design-tokens.md §14).
 */
export function SkeletonStack({
  shape = 'line',
  lines = 3,
  widths,
  label = '불러오는 중입니다',
}: {
  shape?: 'line' | 'field';
  lines?: number;
  widths?: string[];
  label?: string;
}) {
  const items = Array.from({ length: lines }, (_, i) => widths?.[i]);
  return (
    <div className="ui-skeleton-stack" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {items.map((w, i) => (
        <Skeleton key={i} shape={shape} width={w} />
      ))}
    </div>
  );
}

/** 목록·그리드 하나가 통째로 로딩 중일 때 몇 건을 예약해 둘지의 상한. 실제로 몇 건이 올지
 * 모르는 상태에서 자리를 너무 많이 예약하면 "아직 많이 남았다"는 오해를 준다 — §13 stagger
 * 규칙(최초 8개까지만 순차 적용)과 같은 이유로 팀장이 3개로 결정했다(2026-09-14). */
export const MAX_SKELETON_ITEMS = 3;

/**
 * 목록·그리드처럼 몇 건이 올지 모르는 자리에 쓴다. `count`에 예상 건수를 넘겨도 항상
 * 최대 `MAX_SKELETON_ITEMS`(3)개까지만 그린다.
 */
export function SkeletonList({
  shape,
  count = MAX_SKELETON_ITEMS,
  grid = false,
  label = '불러오는 중입니다',
}: {
  shape: 'row' | 'card';
  count?: number;
  grid?: boolean;
  label?: string;
}) {
  const items = Array.from({ length: Math.max(1, Math.min(count, MAX_SKELETON_ITEMS)) });
  return (
    <div
      className={`ui-skeleton-list${grid ? ' ui-skeleton-list--grid' : ''}`}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {items.map((_, i) => (
        <Skeleton key={i} shape={shape} />
      ))}
    </div>
  );
}

/**
 * `SkeletonList`의 일반형 — 카드·목록행처럼 뭉뚱그린 상자 하나가 아니라, 실제 화면에 그려질
 * 마크업(`ProjectCardSkeleton`·`ListRowSkeleton` 등)을 그대로 반복해야 할 때 쓴다.
 * `renderItem`이 항목 하나의 모양을 결정하고, 이 컴포넌트는 role/aria-busy/sr-only 안내와
 * "최대 3개" 상한(`MAX_SKELETON_ITEMS`)만 책임진다(2026-09-14 — 사용자 피드백: 스켈레톤이
 * 로딩 후 실제로 그려지는 모양을 반영해야 한다는 요청으로 `SkeletonList`의 단순 상자 방식을
 * 보완했다).
 */
export function SkeletonGroup({
  as = 'div',
  className,
  count = MAX_SKELETON_ITEMS,
  grid = false,
  label = '불러오는 중입니다',
  renderItem,
}: {
  /** 실제 목록이 `<ul>`(예: `.grid`, `<li className="pcard">`)이면 `"ul"`을 준다 — `<div>`
   * 안에 `<li>`를 두면 시맨틱이 어긋난다. */
  as?: 'div' | 'ul';
  /** 실제 화면이 쓰는 그리드 클래스(예: `"grid grid--cols3"`)를 그대로 넘기면 그 값을 쓴다.
   * 안 주면 기본 `.ui-skeleton-list` 톤을 쓴다. */
  className?: string;
  count?: number;
  grid?: boolean;
  label?: string;
  renderItem: (index: number) => ReactNode;
}) {
  const items = Array.from({ length: Math.max(1, Math.min(count, MAX_SKELETON_ITEMS)) });
  const Container = as;
  return (
    <Container
      className={className ?? `ui-skeleton-list${grid ? ' ui-skeleton-list--grid' : ''}`}
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {items.map((_, i) => renderItem(i))}
    </Container>
  );
}

/**
 * 실제 `ProjectCard`(`.pcard`, `ProjectCard.tsx`)의 마크업을 그대로 흉내 낸다 — 새 컨테이너를
 * 만들지 않고 `.pcard`/`.pcard__top`/`.pcard__skills`/`.pcard__foot` 클래스를 재사용해 실제
 * 카드와 여백·테두리가 어긋나지 않는다.
 *
 * `withCategory`는 카테고리 캡션 줄(`.caption`)이 있는 카드에서만 켠다 — 탐색·홈 카드에는
 * 있고, 북마크 카드(`MyBookmarksPage.tsx`)에는 없다(실제 마크업 기준, 2026-09-14).
 */
export function ProjectCardSkeleton({ withCategory = true }: { withCategory?: boolean }) {
  return (
    <li className="pcard" aria-hidden="true">
      <div className="pcard__top">
        <Skeleton shape="line" width="65%" />
        <Skeleton shape="pill" width="52px" />
      </div>
      {withCategory && <Skeleton shape="line" width="30%" />}
      <Skeleton shape="line" width="42%" />
      <p className="pcard__skills">
        <Skeleton shape="pill" width="48px" />
        <Skeleton shape="pill" width="64px" />
        <Skeleton shape="pill" width="56px" />
      </p>
      <div className="pcard__foot">
        <Skeleton shape="line" width="40%" />
        <Skeleton shape="line" width="30%" />
      </div>
    </li>
  );
}

/**
 * 실제 `.row`(`ProjectManagePage`·`MyApplicationsPage`의 목록행) 마크업을 흉내 낸다.
 * `subLines`·`badges`·`actions`는 화면마다 실제로 그려지는 개수가 달라 호출부에서 넘긴다 —
 * 값을 고정하지 않는 이유는 그 개수 차이 자체가 "실제 콘텐츠를 반영"하는 부분이기 때문이다.
 */
export function ListRowSkeleton({
  subLines = 1,
  badges = 1,
  actions = 0,
}: {
  subLines?: number;
  badges?: number;
  actions?: number;
}) {
  return (
    <div className="row" aria-hidden="true">
      <div className="row__main">
        <Skeleton shape="line" width="55%" />
        {Array.from({ length: subLines }, (_, i) => (
          <Skeleton key={i} shape="line" width="35%" />
        ))}
      </div>
      {badges > 0 && (
        <div className="row__badges">
          {Array.from({ length: badges }, (_, i) => (
            <Skeleton key={i} shape="pill" width="64px" />
          ))}
        </div>
      )}
      {actions > 0 && (
        <div className="row__acts">
          {Array.from({ length: actions }, (_, i) => (
            <Skeleton key={i} shape="button" width="72px" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 실제 `.facts`(`dl`/`dt`/`dd`, `ManageApplicantsPage`의 지원자 항목) 마크업을 흉내 낸다.
 * 이전에는 이 화면에 `SkeletonList shape="row"`를 썼는데, 실제 화면은 `.row`가 아니라
 * `.facts`를 그린다 — 모양이 달라 "로딩 후 화면과 다르게 그려진다"는 원인 중 하나였다
 * (2026-09-14 수정).
 */
export function FactsSkeleton({ withActions = true }: { withActions?: boolean }) {
  return (
    <dl className="facts" aria-hidden="true">
      <dt>
        <Skeleton shape="line" width="30%" />
      </dt>
      <dd>
        <Skeleton shape="line" width="80%" />
      </dd>
      <dt>
        <Skeleton shape="line" width="30%" />
      </dt>
      <dd>
        <Skeleton shape="line" width="95%" />
      </dd>
      {withActions && (
        <div className="btn-row">
          <Skeleton shape="button" width="64px" />
          <Skeleton shape="button" width="64px" />
        </div>
      )}
    </dl>
  );
}

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
