import {
  PaymentGatewayError,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type PaymentGateway,
  type RetrievePaymentResponse,
} from "../server/payment.port";

export const MOCK_OK_PAYMENT_KEY = "pay_mock_ok";
export const MOCK_FAIL_PAYMENT_KEY = "pay_mock_fail";
export const MOCK_RECOVER_PAID_KEY = "pay_mock_timeout_paid";
export const MOCK_CONFIRMED_AMOUNT = 100_000;

export type PaymentGatewayMock = PaymentGateway & {
  tripCircuit(): void;
  isCircuitOpen(): boolean;
};

/** 키 없이 승인 성공·금액 불일치·PG 실패·복구·회로를 재현한다. */
export function createPaymentGatewayMock(): PaymentGatewayMock {
  const retrieved = new Map<string, RetrievePaymentResponse>();
  let circuitOpen = false;

  function remember(row: RetrievePaymentResponse): void {
    retrieved.set(row.orderId, row);
  }

  return {
    tripCircuit() {
      circuitOpen = true;
    },
    isCircuitOpen() {
      return circuitOpen;
    },
    async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse> {
      if (!input.orderId || !input.paymentKey) {
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인에 필요한 값이 없습니다.");
      }
      // 복구 키는 승인 throw, 조회는 PAID.
      if (input.paymentKey === MOCK_RECOVER_PAID_KEY) {
        remember({
          orderId: input.orderId,
          amount: input.amount,
          paymentKey: input.paymentKey,
          status: "PAID",
        });
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인을 완료하지 못했습니다.");
      }
      // 실패 키는 금액 검사 전에 PG 실패로 끝낸다.
      if (input.paymentKey === MOCK_FAIL_PAYMENT_KEY) {
        remember({
          orderId: input.orderId,
          amount: input.amount,
          paymentKey: input.paymentKey,
          status: "FAILED",
        });
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인을 완료하지 못했습니다.");
      }
      if (input.paymentKey !== MOCK_OK_PAYMENT_KEY) {
        remember({
          orderId: input.orderId,
          amount: input.amount,
          paymentKey: input.paymentKey,
          status: "FAILED",
        });
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인을 완료하지 못했습니다.");
      }
      if (input.amount !== MOCK_CONFIRMED_AMOUNT) {
        remember({
          orderId: input.orderId,
          amount: input.amount,
          paymentKey: input.paymentKey,
          status: "FAILED",
        });
        throw new PaymentGatewayError(
          "PAYMENT_AMOUNT_MISMATCH",
          "결제 금액이 계약 금액과 다릅니다.",
        );
      }
      const paid: ConfirmPaymentResponse = {
        orderId: input.orderId,
        amount: input.amount,
        paymentKey: input.paymentKey,
        status: "PAID",
      };
      remember({ ...paid, paymentKey: paid.paymentKey });
      return paid;
    },

    async retrievePayment(orderId: string): Promise<RetrievePaymentResponse> {
      const row = retrieved.get(orderId);
      if (!row) {
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인을 조회하지 못했습니다.");
      }
      return row;
    },
  };
}
