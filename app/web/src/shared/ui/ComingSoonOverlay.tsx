import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './primitives';
import { APP_ROUTES } from '../routes';
import { NOT_YET_SCREENS, type NotYetScreenKey } from '../notYetScreens';
import { DevScreenNote } from './DevScreenNote';

/**
 * "경로·기능 폴더는 있는데 화면이 아직 `app/`에 안 붙었다" 상황(app/web/AGENTS.md "시안에는
 * 있지만 아직 없는 화면" Case 2)의 표준 처리. `App.tsx`의 `NOT_INTEGRATED_ROUTES`가 이 상태다.
 *
 * `NotYetDialog`(Case 1)와 다른 점: 실제로 그 라우트로 이동은 시킨다(주소가 바뀐다 — 가짜가
 * 아니다). 그 라우트가 렌더링하는 내용을 블러 처리해 두고, 다이얼로그는 바깥을 눌러도 Esc를
 * 눌러도 닫히지 않는다 — "뒤로가기" 버튼 하나로만 닫힌다. 이 화면 자체가 아직 쓸 게 없다는
 * 걸 분명히 하기 위해서다.
 */
export type ComingSoonOverlayProps = {
  screenKey: NotYetScreenKey;
  /** 블러 배경에 놓일 실제(미완성) 화면 내용 */
  children: ReactNode;
};

export function ComingSoonOverlay({ screenKey, children }: ComingSoonOverlayProps) {
  const screen = NOT_YET_SCREENS[screenKey];
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function goBack() {
    // react-router가 이 탭 세션 안에서 쌓은 기록(idx)이 있으면 그 이전 화면으로,
    // 주소를 직접 쳐서 들어와 기록이 없으면(idx 0) 홈으로 보낸다.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(APP_ROUTES.home);
  }

  return (
    <div className="comingsoon">
      <div className="comingsoon__content" aria-hidden="true">
        {children}
      </div>

      <div className={`overlay-backdrop${visible ? ' open' : ''}`}>
        <div
          className="dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="comingsoon-title"
          aria-describedby="comingsoon-desc"
        >
          <h2 id="comingsoon-title" className="h3" style={{ marginTop: 0 }}>
            {screen.name}, 준비 중입니다
          </h2>
          <div id="comingsoon-desc">
            <p style={{ marginTop: 0 }}>
              화면을 미리 보여드리고 있습니다. 아직 실제로 이용하실 수는 없습니다.
            </p>
            <DevScreenNote screenKey={screenKey} />
          </div>
          <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="primary" onClick={goBack}>
              뒤로가기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
