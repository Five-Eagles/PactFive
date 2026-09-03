/**
 * 되돌릴 수 없는 행동을 실행 전에 설명한다
 *
 * `design-system/design-tokens.md` §8 의 `DestructiveActionSummary` 패턴이고,
 * `ux-philosophy.md` §6 "비파괴성 — 되돌릴 수 없는 결과를 실행 전에 이해하고 확인한다"
 * 를 충족하기 위한 것이다.
 *
 * ## 왜 필요한가 (CR-0006 결함 1)
 *
 * `프로젝트 취소` 는 프로젝트 하나만 바뀌는 것이 아니다.
 *
 * ```
 * transaction_status → CANCELED    되돌아갈 수 없다 (규칙 31)
 * 대기 지원자 전원 일괄 거절        최윤석 도메인
 * 합의·계약 무효화                  조준영 도메인
 * ```
 *
 * 지원자 5명이 있는 프로젝트를 취소하면 5명에게 거절 알림이 나가는데,
 * 그 사실이 누르기 전에 보이지 않았다.
 *
 * ## 만드는 방식
 *
 * **영향을 화면이 추측하지 않는다.** 무엇이 일어나는지는 부르는 쪽이 알려준다 —
 * 여기서 `pendingApplicationCount` 로 문구를 지어내면 규칙이 두 곳에 생긴다.
 */

import { useEffect, useRef } from "react";
import { Button } from "./ui";

export type DestructiveAction = {
  /** 무엇을 하려는가. `프로젝트 취소` 처럼 버튼과 같은 말을 쓴다 */
  title: string;
  /** 대상. 어느 프로젝트인지 헷갈리지 않게 한다 */
  subject: string;
  /**
   * 실행하면 함께 일어나는 일. 부르는 쪽이 만든다.
   * 비어 있으면 "영향이 없다"가 아니라 "알려주지 않았다"이므로, 그 경우에도
   * 되돌릴 수 없다는 사실은 그대로 보여준다.
   */
  effects: string[];
  /** 확인 버튼 문구. 기본값은 title 과 같다 */
  confirmLabel?: string;
};

export type DestructiveActionSummaryProps = {
  action: DestructiveAction;
  onConfirm: () => void;
  onCancel: () => void;
  /** 요청 중이면 중복 실행을 막는다 */
  pending?: boolean;
};

export function DestructiveActionSummary({
  action,
  onConfirm,
  onCancel,
  pending = false,
}: DestructiveActionSummaryProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 열릴 때 초점을 **취소**에 둔다. 확인에 두면 Enter 한 번으로 실행된다.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Esc 로 닫힌다. 되돌릴 수 없는 행동일수록 빠져나갈 길이 있어야 한다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="dialog dialog--danger"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="destructive-title"
      aria-describedby="destructive-effects"
    >
      <h2 id="destructive-title">{action.title}</h2>

      <p className="dialog__subject">{action.subject}</p>

      <div id="destructive-effects">
        {/* 되돌릴 수 없다는 사실을 먼저. 색이 아니라 문장으로 말한다 */}
        <p className="dialog__warning">이 작업은 되돌릴 수 없습니다.</p>

        {action.effects.length > 0 && (
          <>
            <p className="dialog__label">실행하면 함께 일어나는 일</p>
            <ul className="dialog__effects">
              {action.effects.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="dialog__actions">
        <Button variant="quiet" onClick={onCancel} disabled={pending}>
          그만두기
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {action.confirmLabel ?? action.title}
        </Button>
      </div>
    </div>
  );
}

/**
 * 취소가 무엇에 영향을 주는지 문장으로 만든다.
 *
 * **여기서 규칙을 판정하지 않는다.** 서버가 준 값을 읽어 말로 바꿀 뿐이다.
 */
export function cancelEffects(input: {
  pendingApplicationCount: number;
  hasContract: boolean;
}): string[] {
  const out: string[] = [];
  if (input.pendingApplicationCount > 0) {
    out.push(`대기 중인 지원 ${input.pendingApplicationCount}건이 모두 거절되고 지원자에게 알림이 갑니다`);
  }
  if (input.hasContract) {
    out.push("진행 중이던 금액 합의와 계약이 무효가 됩니다");
  }
  out.push("모집이 마감되고 다시 열 수 없습니다");
  return out;
}

/** 삭제가 무엇에 영향을 주는지 */
export function deleteEffects(): string[] {
  return ["목록·검색·상세 어디에도 나타나지 않습니다"];
}
