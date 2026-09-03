import { useEffect, useRef, useState } from 'react';
import { Button } from '../../shared/ui/primitives';

/**
 * 되돌릴 수 없는 행동을 실행 전에 설명한다
 *
 * 원본: features/project-management/prototype/web/DestructiveActionSummary.tsx
 * (7c82773, CR-0006 결함 1) — `design-system/design-tokens.md` §8 의
 * `DestructiveActionSummary` 패턴이고, `ux-philosophy.md` §6 "비파괴성 — 되돌릴 수 없는
 * 결과를 실행 전에 이해하고 확인한다" 를 충족하기 위한 것이다.
 *
 * ## 왜 필요한가
 *
 * `프로젝트 취소` · `삭제` · `모집 마감` 이 누르는 즉시 실행됐다. 특히 취소는 프로젝트
 * 하나만 바뀌는 것이 아니다 — 대기 지원자 전원이 거절되고, 진행 중이던 계약이 있으면
 * 무효가 된다. 그 사실이 누르기 전에 보이지 않았다.
 *
 * ## 문구 정본
 *
 * 원본 prototype 은 이 세 행동 중 취소·삭제 둘만 확인 단계를 거쳤다(모집 마감은 재모집으로
 * 되돌릴 수 있다고 보았다). 그런데 `features/project-management/design/high-fi-manage.html`
 * ("확인 다이얼로그 3종")은 **모집 마감도 포함해 셋 다** 확인 다이얼로그로 그려 두었고, 세 다이얼로그의
 * 제목·본문·버튼 문구를 정확한 텍스트로 정해 두었다 — 대기 지원 거절은 모집을 다시 열어도
 * 되돌아오지 않아 그 자체로 되돌릴 수 없는 결과이기 때문으로 보인다. 화면 구조·문구의 정본은
 * `prototype/web/*.tsx` 가 아니라 `design/*.html` 이므로(app/web/AGENTS.md "무엇이 무엇의
 * 정본인가"), 이 통합에서는 시안 쪽 범위(3종)와 정확한 문구를 따랐다 — prototype 의 2종에서
 * 늘어난 부분이라 `feedback_loop/`에 남긴다.
 *
 * 지원자·계약 문구가 조건에 따라 붙거나 빠지는 것(시안 "본문의 지원자·계약 문구는 조건에 따라
 * 붙거나 빠진다")은 시안이 방향만 정하고 정확한 합성 문구까지는 정하지 않아, 실제 부작용
 * (대기 지원 거절 · 계약 무효화)을 각각의 조건절로 조합했다 — 이 조합도 시안이 확정하지 않은
 * 부분이라 feedback_loop 대상이다.
 *
 * ## 만드는 방식
 *
 * **영향을 화면이 추측하지 않는다.** `pendingApplicationCount`·`hasContract` 는 호출부가
 * 서버 응답에서 그대로 전달한다 — 여기서 규칙을 판정하면 규칙이 두 곳에 생긴다.
 *
 * 초점을 **그만두기**에 둔다 — 확인 버튼에 두면 Enter 한 번으로 실행된다. Esc 로 닫힌다.
 * `role="alertdialog"` + `aria-describedby` 로 영향 문구를 연결한다(design-tokens.md §10).
 *
 * 오버레이 모션·마운트 시 `open` 클래스 지연은 `ReopenRecruitmentDialog.tsx` 와 같은 방식이다
 * (design-tokens.md §13, `shared/ui/tokens.css` 의 `.overlay-backdrop`·`.dialog`).
 */

export type DestructiveActionId = 'CLOSE_RECRUITMENT' | 'CANCEL' | 'DELETE';

export type DestructiveActionSummaryProps = {
  actionId: DestructiveActionId;
  /** 어느 프로젝트인지. 여러 건을 관리하는 목록 위에 뜨므로 헷갈리지 않게 한다 */
  projectTitle: string;
  /** 대기 중인 지원 수. 서버가 준 값을 그대로 전달한다 */
  pendingApplicationCount: number;
  /** 진행 중인 계약(합의 대기 이상)이 있는가. 없으면 계약 관련 문구를 붙이지 않는다 */
  hasContract?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 요청 중이면 중복 실행을 막는다 */
  pending?: boolean;
};

const TITLE: Record<DestructiveActionId, string> = {
  CLOSE_RECRUITMENT: '모집을 마감할까요?',
  CANCEL: '프로젝트를 취소할까요?',
  DELETE: '프로젝트를 삭제할까요?',
};

const CONFIRM_LABEL: Record<DestructiveActionId, string> = {
  CLOSE_RECRUITMENT: '마감하기',
  CANCEL: '취소하기',
  DELETE: '삭제하기',
};

const CONFIRM_VARIANT: Record<DestructiveActionId, 'primary' | 'danger'> = {
  CLOSE_RECRUITMENT: 'primary',
  CANCEL: 'danger',
  DELETE: 'danger',
};

/**
 * 본문 문구. 시안의 정확한 텍스트를 기본으로 하되, 지원자·계약 조건에 따라
 * 뒤 문장을 붙이거나 뺀다(시안 "본문의 지원자·계약 문구는 조건에 따라 붙거나 빠진다").
 */
function bodyText(
  actionId: DestructiveActionId,
  pendingApplicationCount: number,
  hasContract: boolean,
): string {
  if (actionId === 'CLOSE_RECRUITMENT') {
    let text = '마감하면 다시 모집할 수 없습니다.';
    if (pendingApplicationCount > 0) {
      text += ` 대기 중인 지원 ${pendingApplicationCount}건이 거절 처리됩니다.`;
    }
    return text;
  }

  if (actionId === 'CANCEL') {
    let text = '취소하면 되돌릴 수 없습니다.';
    if (pendingApplicationCount > 0) {
      text += ` 대기 중인 지원 ${pendingApplicationCount}건이 거절 처리됩니다.`;
    }
    if (hasContract) {
      text += ' 선정된 프리랜서에게 취소 알림이 전송되고, 진행 중이던 계약이 무효 처리됩니다.';
    }
    return text;
  }

  // DELETE — pendingApplicationCount > 0 이면 애초에 삭제 버튼이 막혀 있다 (규칙 15류).
  return '삭제하면 목록에서 사라집니다. 되돌릴 수 없습니다.';
}

export function DestructiveActionSummary({
  actionId,
  projectTitle,
  pendingApplicationCount,
  hasContract = false,
  onConfirm,
  onCancel,
  pending = false,
}: DestructiveActionSummaryProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // 열릴 때 초점을 **그만두기**(첫 버튼)에 둔다. 확인 버튼에 두면 Enter 한 번으로 실행된다.
  // `Button` 은 ref 를 전달하지 않는 얇은 wrapper라 컨테이너에서 첫 <button> 을 찾는다.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  // Esc 로 닫힌다. 되돌릴 수 없는 행동일수록 빠져나갈 길이 있어야 한다.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const body = bodyText(actionId, pendingApplicationCount, hasContract);

  return (
    <div
      className={`overlay-backdrop${visible ? ' open' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="destructive-title"
        aria-describedby="destructive-body"
      >
        <h2 id="destructive-title" className="h3" style={{ marginTop: 0 }}>
          {TITLE[actionId]}
        </h2>

        <p className="caption" style={{ margin: '0 0 12px' }}>
          {projectTitle}
        </p>

        <p id="destructive-body" style={{ margin: '0 0 20px', color: 'var(--content-secondary)', lineHeight: '24px' }}>
          {body}
        </p>

        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="quiet" onClick={onCancel} disabled={pending}>
            그만두기
          </Button>
          <Button
            variant={CONFIRM_VARIANT[actionId]}
            onClick={onConfirm}
            loading={pending}
          >
            {CONFIRM_LABEL[actionId]}
          </Button>
        </div>
      </div>
    </div>
  );
}
