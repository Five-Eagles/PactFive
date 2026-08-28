/**
 * engagement 공용 UI 조각
 *
 * ## project-management 의 ui.tsx 와 거의 같다
 *
 * 그쪽에서 import 하지 않는다 — **기능 폴더 간 직접 import 금지** (2026-08-28 팀 표준).
 * 지금은 중복이지만, 통합 단계에서 `app/web/src/shared/` 로 뺄 후보다.
 * 그때까지 두 벌을 따로 두는 편이 나중에 한쪽만 고쳐지는 것보다 안전하다.
 *
 * props 이름과 값 목록은 `design-system/design-tokens.md` 와 같게 맞췄다.
 * 색은 `design/_tokens.css` 변수로만 넣는다.
 */

import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type FeedbackTone = "neutral" | "info" | "success" | "warning" | "danger";

export type ButtonProps = {
  variant: ButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
};

export function Button({ variant, disabled = false, onClick, children }: ButtonProps) {
  return (
    <button type="button" className={`btn ${variant}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Badge({ tone, label }: { tone: FeedbackTone; label: string }) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

/** 라벨과 색조는 design-tokens.md 의 statusPresentation 을 따른다 */
const RECRUITMENT = {
  SCHEDULED: { label: "모집 예정", tone: "info" },
  OPEN: { label: "모집 중", tone: "success" },
  CLOSED: { label: "모집 마감", tone: "neutral" },
} as const;

export type RecruitmentStatus = keyof typeof RECRUITMENT;

export function RecruitmentBadge({ status }: { status: RecruitmentStatus }) {
  const p = RECRUITMENT[status];
  return <Badge tone={p.tone} label={p.label} />;
}

export function Money({ amount }: { amount: number }) {
  return <span className="money">{amount.toLocaleString("ko-KR")}원</span>;
}

export function Chip({ label }: { label: string }) {
  return <span className="chip">{label}</span>;
}

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
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
