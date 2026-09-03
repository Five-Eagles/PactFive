import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { AgreementPanel, type AgreementView } from "./AgreementPanel";
import { ContractSignPanel, type ContractSignView } from "./ContractSignPanel";
import { PaymentPanel, type PaymentView } from "./PaymentPanel";

export { AgreementPanel, ContractSignPanel, PaymentPanel };

type PreviewPanel = "agreement" | "sign" | "payment";

const PANEL_TABS: { id: PreviewPanel; label: string }[] = [
  { id: "agreement", label: "합의" },
  { id: "sign", label: "서명" },
  { id: "payment", label: "결제" },
];

const AGREEMENT_VIEWS: { id: AgreementView; label: string }[] = [
  { id: "create", label: "제안 전" },
  { id: "loading", label: "불러오는 중" },
  { id: "loadFailed", label: "불러오기 실패" },
  { id: "stale", label: "다시 불러오기" },
  { id: "canceled", label: "취소됨" },
  { id: "proposed", label: "응답 대기" },
  { id: "respond", label: "수락·거절" },
];

const SIGN_VIEWS: { id: ContractSignView; label: string }[] = [
  { id: "ready", label: "서명하기" },
  { id: "waiting", label: "서명 중" },
  { id: "loading", label: "불러오는 중" },
  { id: "loadFailed", label: "불러오기 실패" },
  { id: "canceled", label: "취소됨" },
];

const PAYMENT_VIEWS: { id: PaymentView; label: string }[] = [
  { id: "checkout", label: "결제 전" },
  { id: "keyMissing", label: "연동 준비 중" },
  { id: "pending", label: "처리 중" },
  { id: "paid", label: "결제 완료" },
  { id: "failed", label: "결제 실패" },
];

function PreviewSwitcher<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="preview-switcher" role="toolbar" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** preview:dev 전용 전환. 합의·서명·결제. 앱 셸은 없다. */
export default function PaymentsPreview() {
  const [panel, setPanel] = useState<PreviewPanel>("payment");
  const [agreementView, setAgreementView] = useState<AgreementView>("create");
  const [signView, setSignView] = useState<ContractSignView>("ready");
  const [paymentView, setPaymentView] = useState<PaymentView>("checkout");

  return (
    <div className="preview-root">
      <PreviewSwitcher
        label="패널 전환"
        value={panel}
        options={PANEL_TABS}
        onChange={(id) => setPanel(id)}
      />
      {panel === "agreement" && (
        <>
          <PreviewSwitcher
            label="합의 상태"
            value={agreementView}
            options={AGREEMENT_VIEWS}
            onChange={(id) => setAgreementView(id)}
          />
          <AgreementPanel view={agreementView} />
        </>
      )}
      {panel === "sign" && (
        <>
          <PreviewSwitcher
            label="서명 상태"
            value={signView}
            options={SIGN_VIEWS}
            onChange={(id) => setSignView(id)}
          />
          <ContractSignPanel view={signView} />
        </>
      )}
      {panel === "payment" && (
        <>
          <PreviewSwitcher
            label="결제 상태"
            value={paymentView}
            options={PAYMENT_VIEWS}
            onChange={(id) => setPaymentView(id)}
          />
          <PaymentPanel view={paymentView} />
        </>
      )}
    </div>
  );
}
