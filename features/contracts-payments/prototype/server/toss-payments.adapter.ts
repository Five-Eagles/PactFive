import {
  PaymentGatewayError,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type PaymentGateway,
  type PgPaymentStatus,
  type RetrievePaymentResponse,
} from "./payment.port";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const TOSS_ORDER_URL = "https://api.tosspayments.com/v1/payments/orders";

export function hasPgSecretKey(): boolean {
  return Boolean(process.env.PG_SECRET_KEY);
}

function basicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

/** PG_SECRET_KEY가 있을 때만 sandbox confirm을 보낸다. 키 없으면 생성하지 않는다. */
export function createTossPaymentsAdapter(): PaymentGateway {
  const secretKey = process.env.PG_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PG_SECRET_KEY가 없습니다. Mock을 쓰거나 .env에 키를 넣으세요.");
  }
  return {
    async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse> {
      // 위젯 없이 잘못된 paymentKey면 4xx만 확인한다.
      const response = await fetch(TOSS_CONFIRM_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(secretKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        }),
      });
      if (!response.ok) {
        throw new PaymentGatewayError(
          "PAYMENT_CONFIRM_FAILED",
          "결제 승인을 완료하지 못했습니다.",
        );
      }
      const body = (await response.json()) as { orderId?: string; totalAmount?: number; paymentKey?: string };
      return {
        orderId: body.orderId ?? input.orderId,
        amount: body.totalAmount ?? input.amount,
        paymentKey: body.paymentKey ?? input.paymentKey,
        status: "PAID",
      };
    },

    async retrievePayment(orderId: string): Promise<RetrievePaymentResponse> {
      const response = await fetch(`${TOSS_ORDER_URL}/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: basicAuthHeader(secretKey) },
      });
      if (!response.ok) {
        throw new PaymentGatewayError("PAYMENT_CONFIRM_FAILED", "결제 승인을 조회하지 못했습니다.");
      }
      const body = (await response.json()) as {
        orderId?: string;
        totalAmount?: number;
        paymentKey?: string;
        status?: string;
      };
      return {
        orderId: body.orderId ?? orderId,
        amount: body.totalAmount ?? 0,
        paymentKey: body.paymentKey ?? null,
        status: mapTossStatus(body.status),
      };
    },
  };
}

function mapTossStatus(raw: string | undefined): PgPaymentStatus {
  if (raw === "DONE") return "PAID";
  if (raw === "READY") return "READY";
  if (raw === "ABORTED" || raw === "EXPIRED") return "FAILED";
  return "PENDING";
}
