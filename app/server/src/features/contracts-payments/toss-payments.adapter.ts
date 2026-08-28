import {
  PaymentGatewayError,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type PaymentGateway,
} from './payment.port';

/**
 * 토스페이먼츠 결제 승인 어댑터.
 *
 * 원본: features/contracts-payments/prototype/server/toss-payments.adapter.ts (47c7760)
 *
 * `PG_SECRET_KEY` 는 **서버 전용 비밀값**이다 — `VITE_` 접두사를 절대 붙이지 않는다
 * (app/web/AGENTS.md "환경 변수"). 키가 없으면 어댑터를 만들지 않고 예외를 던진다:
 * 키 없이 조용히 성공하는 가짜 결제가 생기는 것보다 조립 지점에서 끊기는 쪽이 안전하다.
 *
 * 샌드박스 키 발급 현황은 features/contracts-payments/review/teamlead-pg-sandbox-keys.md 참고.
 */

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

export function hasPgSecretKey(): boolean {
  return Boolean(process.env.PG_SECRET_KEY);
}

function basicAuthHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

export function createTossPaymentsAdapter(): PaymentGateway {
  const secretKey = process.env.PG_SECRET_KEY;
  if (!secretKey) {
    throw new Error('PG_SECRET_KEY가 없습니다. .env에 샌드박스 키를 넣으세요.');
  }
  return {
    async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse> {
      const response = await fetch(TOSS_CONFIRM_URL, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(secretKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentKey: input.paymentKey,
          orderId: input.orderId,
          amount: input.amount,
        }),
      });
      if (!response.ok) {
        throw new PaymentGatewayError('PAYMENT_CONFIRM_FAILED', '결제 승인을 완료하지 못했습니다.');
      }
      const body = (await response.json()) as {
        orderId?: string;
        totalAmount?: number;
        paymentKey?: string;
      };
      return {
        orderId: body.orderId ?? input.orderId,
        amount: body.totalAmount ?? input.amount,
        paymentKey: body.paymentKey ?? input.paymentKey,
        status: 'PAID',
      };
    },
  };
}
