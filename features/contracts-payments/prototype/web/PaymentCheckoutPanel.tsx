export type PaymentCheckoutView = "ready" | "failed";

type PaymentCheckoutPanelProps = {
  view?: PaymentCheckoutView;
};

/** 결제 화면. 실패 시 같은 행 재시도를 안내한다. */
export function PaymentCheckoutPanel({ view = "ready" }: PaymentCheckoutPanelProps) {
  if (view === "failed") {
    return (
      <div>
        <p>결제 금액</p>
        <button type="button">다시 결제</button>
      </div>
    );
  }
  return (
    <div>
      <p>결제 금액</p>
      <button type="button">결제하기</button>
    </div>
  );
}
