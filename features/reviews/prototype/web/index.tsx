import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { ReviewPanel } from "./ReviewPanel";

export { ReviewPanel };

/** preview:dev 기본 화면. 패널 옆에 오버레이 리듬만 둔다. 앱 셸은 없다. */
export default function ReviewsPreview() {
  const [overlayOpen, setOverlayOpen] = useState(false);

  return (
    <>
      <ReviewPanel />
      <div className="btn-row">
        <button type="button" className="btn secondary" onClick={() => setOverlayOpen(true)}>
          오버레이 리듬
        </button>
      </div>
      <div
        className={overlayOpen ? "overlay-backdrop open" : "overlay-backdrop"}
        aria-hidden={overlayOpen ? "false" : "true"}
        onClick={(event) => {
          // 딤을 누르면 닫는다. 본체 클릭은 유지한다.
          if (event.target === event.currentTarget) setOverlayOpen(false);
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
          <h2 className="title" id="overlay-title">
            오버레이 리듬
          </h2>
          <p className="status-copy">
            딤과 본체가 함께 240ms로 나타납니다. 카드 그리드 stagger와 앱 셸은 쓰지 않습니다.
          </p>
          <div className="btn-row">
            <button type="button" className="btn quiet" onClick={() => setOverlayOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
