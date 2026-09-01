import { AgreementPanel } from "./AgreementPanel";
import { ContractSignPanel } from "./ContractSignPanel";
import { PaymentCheckoutPanel } from "./PaymentCheckoutPanel";

/** 프리뷰 기본 화면. 합의 빈 생성·서명·결제 뼈대를 한 번에 보여 준다. */
export default function ContractsPaymentsPreview() {
  return (
    <div>
      <AgreementPanel view="empty" />
      <ContractSignPanel view="draft" />
      <PaymentCheckoutPanel view="ready" />
    </div>
  );
}
