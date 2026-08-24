import type { ConfirmPaymentRequest, ConfirmPaymentResult, PaymentGateway } from "./payment.port";

// 토스페이먼츠 어댑터 — 구현 초안. 실제 구현에서는 @tosspayments/payment-server-sdk 등을 사용한다.
// PG_SECRET_KEY 등 실제 값은 커밋하지 않는다 (docs/naming-convention.md §12).
export class TossPaymentsAdapter implements PaymentGateway {
  async confirmPayment(request: ConfirmPaymentRequest): Promise<ConfirmPaymentResult> {
    throw new Error("prototype only — not implemented (실제로는 토스페이먼츠 결제 승인 API 호출)");
  }
}
