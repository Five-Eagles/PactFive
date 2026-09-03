import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './primitives';
import { NOT_YET_SCREENS, type NotYetScreenKey } from '../notYetScreens';

/**
 * "화면 자체가 없다" 상황(app/web/AGENTS.md "시안에는 있지만 아직 없는 화면" Case 1)의
 * 표준 처리 — `reference-proposal/bundle.html`의 `demo/notyet.js`를 React로 옮긴 것이다.
 *
 * 제자리에서 모달만 뜬다. 실제로 이동하지 않으므로 "닫기"로 그냥 닫힌다 — 라우트가 바뀌지
 *않았으니 되돌아갈 곳도 없다. 경로가 실제로 있는 경우(Case 2)는 `ComingSoonOverlay`를 쓴다.
 *
 * 모션은 `ReopenRecruitmentDialog`와 같은 패턴(마운트 다음 프레임에 `open` 클래스 — 그래야
 * §13의 페이드인이 재생된다)을 그대로 따른다.
 */
function NotYetDialog({ screenKey, onClose }: { screenKey: NotYetScreenKey; onClose: () => void }) {
  const screen = NOT_YET_SCREENS[screenKey];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className={`overlay-backdrop${visible ? ' open' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="notyet-title"
        aria-describedby="notyet-desc"
      >
        <h2 id="notyet-title" className="h3" style={{ marginTop: 0 }}>
          {screen.name} 화면은 아직 없습니다
        </h2>
        <div id="notyet-desc">
          {screen.note && (
            <p style={{ marginTop: 0 }}>{screen.note}</p>
          )}
          <dl className="caption" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px' }}>
            <dt style={{ fontWeight: 700 }}>담당</dt>
            <dd style={{ margin: 0 }}>{screen.owner}</dd>
            <dt style={{ fontWeight: 700 }}>명세</dt>
            <dd style={{ margin: 0 }}>
              <code>{screen.where}</code>
            </dd>
          </dl>
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="primary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 겉모습은 보통 버튼/링크와 같지만, 눌러도 이동하지 않고 `NotYetDialog`를 연다.
 * 시맨틱은 `<button>`으로 둔다 — 실제로 어디로도 이동하지 않으니 `<a>`가 아니다.
 */
export type NotYetTriggerProps = {
  screenKey: NotYetScreenKey;
  className?: string;
  children: ReactNode;
};

export function NotYetTrigger({ screenKey, className, children }: NotYetTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <NotYetDialog screenKey={screenKey} onClose={() => setOpen(false)} />}
    </>
  );
}
