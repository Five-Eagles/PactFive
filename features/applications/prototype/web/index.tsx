import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { ApplicationPanel, type ApplicationView } from "./ApplicationPanel";

export { ApplicationPanel };

const PREVIEW_VIEWS: { id: ApplicationView; label: string }[] = [
  { id: "apply", label: "지원하기" },
  { id: "manage", label: "지원자 관리" },
  { id: "manageEmpty", label: "빈 목록" },
  { id: "conflict", label: "이미 수락됨" },
  { id: "mine", label: "내 지원" },
  { id: "mineDeleted", label: "삭제된 프로젝트" },
  { id: "loading", label: "불러오는 중" },
  { id: "loadFailed", label: "불러오기 실패" },
];

/** preview:dev 전용 전환. 지원 패널만. 앱 셸은 없다. */
export default function ApplicationsPreview() {
  const [view, setView] = useState<ApplicationView>("apply");

  return (
    <div className="preview-root">
      <div className="preview-switcher" role="toolbar" aria-label="지원 화면 상태">
        {PREVIEW_VIEWS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            aria-pressed={view === opt.id}
            onClick={() => setView(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <ApplicationPanel view={view} />
    </div>
  );
}
