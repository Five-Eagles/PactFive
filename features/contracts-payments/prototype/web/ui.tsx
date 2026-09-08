/**
 * 합의·서명·결제 패널 공용 조각.
 * props 이름과 tone 값은 design-tokens.md 와 같다.
 * 색은 design/_tokens.css 변수 클래스만 쓴다. 다른 기능 폴더에서 import 하지 않는다.
 */

import { forwardRef, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type FeedbackTone = "neutral" | "info" | "success" | "warning" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  {
    variant: ButtonVariant;
    type?: "button" | "submit";
    disabled?: boolean;
    busy?: boolean;
    form?: string;
    onClick?: () => void;
    children: ReactNode;
  }
>(function Button(
  { variant, type = "button", disabled = false, busy = false, form, onClick, children },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`btn ${variant}`}
      disabled={disabled || busy}
      aria-busy={busy ? "true" : undefined}
      form={form}
      onClick={onClick}
    >
      {children}
    </button>
  );
});

export function Badge({ tone, label }: { tone: FeedbackTone; label: string }) {
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function Money({ amount }: { amount: number }) {
  return <span className="money">{amount.toLocaleString("ko-KR")}원</span>;
}

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <p className={`notice ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {children}
    </p>
  );
}
