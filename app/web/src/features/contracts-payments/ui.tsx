/**
 * 합의·서명·결제 패널 공용 조각.
 *
 * 원본: features/contracts-payments/prototype/web/ui.tsx (67207c8)
 *
 * **다른 기능 폴더에서 import하지 않는다.** `shared/ui/primitives.tsx`를 쓰지 않는 이유 —
 * 이 기능의 화면 구조 정본인 `features/contracts-payments/design/panel.css`가
 * `.btn.primary`·`.badge.neutral`처럼 공백으로 구분한 클래스를 쓰는데, project-management가
 * 쓰는 `shared/ui/primitives.tsx`는 2026-08-28 반영에서 BEM(`.btn--primary`)으로 바뀌었다.
 * 두 기능의 시안이 서로 다른 클래스 표기를 정본으로 확정해 둔 상태라, 공용 컴포넌트를 억지로
 * 맞추면 한쪽 시안과 어긋난다 — feedback_loop/2026-09-03/contracts-payments.md에 이 불일치를
 * 남겨 두었다. 지금은 시안을 그대로 따르는 이 로컬 버전을 쓴다.
 */

import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type FeedbackTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function Button({
  variant,
  type = 'button',
  disabled = false,
  onClick,
  children,
}: {
  variant: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button type={type} className={`btn ${variant}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Badge({ tone, label }: { tone: FeedbackTone; label: string }) {
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function Money({ amount }: { amount: number }) {
  return <span className="money">{amount.toLocaleString('ko-KR')}원</span>;
}

export function Notice({ tone, children }: { tone: 'info' | 'warning' | 'danger'; children: ReactNode }) {
  return (
    <p className={`notice ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
