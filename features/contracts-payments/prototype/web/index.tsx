import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { AgreementPanel, type AgreementView } from "./AgreementPanel";
import type { AgreementUiState } from "./agreement.view-model";
import { ContractSignPanel } from "./ContractSignPanel";
import { PaymentPanel } from "./PaymentPanel";

export { AgreementPanel, ContractSignPanel, PaymentPanel };

type PreviewScreen =
  | { id: "payment"; label: string }
  | { id: "sign"; label: string }
  | { id: "agreement"; label: string; uiState?: AgreementUiState; view?: AgreementView; amountError?: boolean };

const PREVIEW_SCREENS: PreviewScreen[] = [
  { id: "payment", label: "결제" },
  { id: "sign", label: "서명" },
  { id: "agreement", label: "합의 · 제안 전", uiState: "NOT_PROPOSED" },
  { id: "agreement", label: "합의 · 입력 오류", uiState: "NOT_PROPOSED", amountError: true },
  { id: "agreement", label: "합의 · 응답 대기", uiState: "WAITING_RESPONSE" },
  { id: "agreement", label: "합의 · 프리랜서 응답", uiState: "ACTION_REQUIRED" },
  { id: "agreement", label: "합의 · 완료", uiState: "AGREED" },
  { id: "agreement", label: "합의 · 거절 재개", uiState: "REJECTED_REOPENED" },
  { id: "agreement", label: "합의 · 거절 종료", uiState: "REJECTED_CLOSED" },
  { id: "agreement", label: "합의 · 불러오는 중", view: "loading" },
  { id: "agreement", label: "합의 · 실패", uiState: "LOAD_FAILED" },
  { id: "agreement", label: "합의 · 409", uiState: "STALE" },
  { id: "agreement", label: "합의 · 취소", uiState: "PROJECT_CANCELED" },
  { id: "agreement", label: "합의 · 403", uiState: "FORBIDDEN" },
  { id: "agreement", label: "합의 · 404", uiState: "NOT_FOUND" },
];

/** preview:dev. 기본은 결제 패널. 합의는 상태 전환으로 본다. 앱 셸은 없다. */
export default function PaymentsPreview() {
  const [screenIndex, setScreenIndex] = useState(0);
  const screen = PREVIEW_SCREENS[screenIndex] ?? PREVIEW_SCREENS[0];

  return (
    <div className="preview-root">
      <div className="preview-switcher" role="toolbar" aria-label="contracts-payments 화면">
        {PREVIEW_SCREENS.map((opt, index) => (
          <button
            key={`${opt.label}-${index}`}
            type="button"
            aria-pressed={screenIndex === index}
            onClick={() => setScreenIndex(index)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {screen.id === "payment" ? <PaymentPanel /> : null}
      {screen.id === "sign" ? <ContractSignPanel /> : null}
      {screen.id === "agreement" ? (
        <AgreementPanel
          key={screen.label}
          uiState={screen.uiState}
          view={screen.view}
          amountError={screen.amountError}
        />
      ) : null}
    </div>
  );
}
