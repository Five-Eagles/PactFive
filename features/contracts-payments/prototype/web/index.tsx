import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { AgreementPanel } from "./AgreementPanel";
import { ContractSignPanel } from "./ContractSignPanel";
import { PaymentPanel } from "./PaymentPanel";

export { AgreementPanel, ContractSignPanel, PaymentPanel };

/** preview:dev 기본 화면. 결제 패널만. 앱 셸은 없다. */
export default function PaymentsPreview() {
  return <PaymentPanel />;
}
