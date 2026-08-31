export type PaymentView = "checkout" | "keyMissing";

type PaymentPanelProps = {
  view?: PaymentView;
  amount?: number;
};

/** 결제 패널. 시크릿은 읽지 않고 view로 키 없음 상태를 받는다. */
export function PaymentPanel({ view = "checkout", amount = 100_000 }: PaymentPanelProps) {
  if (view === "keyMissing") {
    // 시크릿을 읽지 않는다. 결제하기와 가짜 성공을 두지 않는다.
    return (
      <div>
        <p>결제 연동 준비 중</p>
        <p>지금은 결제를 진행할 수 없습니다. 연동이 끝나면 다시 시도해 주세요.</p>
        <button type="button">다시 시도</button>
      </div>
    );
  }
  return (
    <div>
      <p>결제 금액 {amount.toLocaleString("ko-KR")}원</p>
      <button type="button">결제하기</button>
    </div>
  );
}
