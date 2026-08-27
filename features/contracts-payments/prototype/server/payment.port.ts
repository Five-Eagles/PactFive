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
  status: "PAID";
};

export type PaymentGatewayErrorCode = "PAYMENT_AMOUNT_MISMATCH" | "PAYMENT_CONFIRM_FAILED";

/** PG 승인 실패. 프로젝트 연동 4함수 오류와 섞지 않는다. */
export class PaymentGatewayError extends Error {
  constructor(
    public readonly code: PaymentGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

/** 결제 승인은 이 포트만 본다. 컨트롤러는 토스 SDK를 직접 import하지 않는다. */
export type PaymentGateway = {
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse>;
};

export function isPaymentGatewayError(err: unknown): err is PaymentGatewayError {
  return err instanceof PaymentGatewayError;
}
