import { useState } from "react";
import { useContract } from "./useContract";

type ContractDetailProps = {
  contractId?: string;
};

// design/low-fi.html의 필드 구성을 그대로 따른다. 실제 컴포넌트는 design-system 확정 후
// high-fi로 다시 만든다.
export function ContractDetail({ contractId = "con_mock0001" }: ContractDetailProps) {
  const { contract, payment, delivery, errorMessage, sign, pay, requestDelivery, approveDelivery } =
    useContract(contractId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runAction = async (action: () => Promise<void>) => {
    setIsSubmitting(true);
    try {
      await action();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <h2>계약 상세</h2>
      <p>합의 금액: {contract.agreedAmount.toLocaleString()}원</p>
      <p>계약 상태: {contract.status}</p>

      <button type="button" disabled={isSubmitting} onClick={() => runAction(sign)}>
        계약 서명하기
      </button>

      <div>
        <p>결제 금액: {payment.paymentAmount.toLocaleString()}원</p>
        <p>플랫폼 수수료: {payment.platformFeeAmount.toLocaleString()}원</p>
        <p>정산 예정액: {payment.settlementAmount.toLocaleString()}원</p>
        <p>결제 상태: {payment.status}</p>
        <button type="button" disabled={isSubmitting} onClick={() => runAction(pay)}>
          결제하기
        </button>
      </div>

      <div>
        <p>납품 상태: {delivery.status}</p>
        <button type="button" disabled={isSubmitting} onClick={() => runAction(requestDelivery)}>
          납품 요청
        </button>
        <button type="button" disabled={isSubmitting} onClick={() => runAction(approveDelivery)}>
          납품 승인
        </button>
      </div>

      {errorMessage && <p role="alert">{errorMessage}</p>}
    </section>
  );
}
