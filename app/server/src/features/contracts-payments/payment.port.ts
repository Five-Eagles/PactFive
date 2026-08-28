/**
 * 결제 게이트웨이 포트.
 *
 * 원본: features/contracts-payments/prototype/server/payment.port.ts (47c7760)
 * app/server/AGENTS.md "외부 벤더 연동" 표의 `결제 → payment.port.ts (PaymentGateway)` 자리다.
 * 컨트롤러·서비스는 토스 SDK 를 직접 import 하지 않는다 (ADR-0009).
 */

export type ConfirmPaymentInput = {
  orderId: string;
  amount: number;
  /** PG가 준 결제 키. 필드명에 공급자 이름을 넣지 않는다. */
  paymentKey: string;
};

export type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};

export type PaymentGatewayErrorCode = 'PAYMENT_AMOUNT_MISMATCH' | 'PAYMENT_CONFIRM_FAILED';

/** PG 승인 실패. 프로젝트 연동 계약 오류(DomainContractError)와 섞지 않는다. */
export class PaymentGatewayError extends Error {
  constructor(
    public readonly code: PaymentGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentGatewayError';
  }
}

/** 결제 승인은 이 포트만 본다. */
export type PaymentGateway = {
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse>;
};

export function isPaymentGatewayError(error: unknown): error is PaymentGatewayError {
  return error instanceof PaymentGatewayError;
}
