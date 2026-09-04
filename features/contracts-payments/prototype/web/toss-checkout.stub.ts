import type { PreparePaymentResponse } from "../mock/payment-record.mock";
import type { PaymentUiState } from "./payment.view-model";

export type TossCheckoutRequest = {
  clientKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  successUrl: string;
  failUrl: string;
};

/** 준비 응답을 고치지 않고 SDK 입력으로 옮긴다. */
export function toTossCheckoutRequest(prepare: PreparePaymentResponse): TossCheckoutRequest {
  return {
    clientKey: prepare.clientKey,
    orderId: prepare.orderId,
    orderName: prepare.orderName,
    amount: prepare.amount,
    successUrl: prepare.successUrl,
    failUrl: prepare.failUrl,
  };
}

export function canOpenCheckout(uiState: PaymentUiState): boolean {
  return uiState === "PAYMENT_AVAILABLE" || uiState === "FAILED_RETRYABLE";
}

/** 성공 Redirect 쿼리만 본다. 완료 증거로 쓰지 않는다. */
export function parseTossSuccessQuery(
  search: string,
): { paymentKey: string; orderId: string; amount: number } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const paymentKey = params.get("paymentKey")?.trim() ?? "";
  const orderId = params.get("orderId")?.trim() ?? "";
  const amountRaw = params.get("amount")?.trim() ?? "";
  const amount = Number(amountRaw);
  if (!paymentKey || !orderId || !Number.isFinite(amount) || amount <= 0) return null;
  return { paymentKey, orderId, amount };
}

/** 이미 PAID면 confirm을 다시 치지 않는다. */
export function shouldConfirmRedirect(
  query: { paymentKey: string; orderId: string; amount: number } | null,
  paymentStatus: string | null,
): boolean {
  if (paymentStatus === "PAID") return false;
  return query != null;
}

export function failRedirectCopy(): string {
  return "결제가 진행되지 않았습니다.";
}

export type TossCheckoutStub = {
  calls: TossCheckoutRequest[];
  requestPayment(req: TossCheckoutRequest): Promise<void>;
};

export function createTossCheckoutStub(): TossCheckoutStub {
  const calls: TossCheckoutRequest[] = [];
  return {
    calls,
    async requestPayment(req) {
      calls.push({ ...req });
    },
  };
}

/** 준비 실패는 stub을 부르지 않고, 진행 중 중복 클릭은 한 번만 보낸다. */
export function createCheckoutOrchestrator(stub: TossCheckoutStub) {
  let inflight = false;
  return {
    async start(prepare: PreparePaymentResponse | null, uiState: PaymentUiState): Promise<void> {
      if (!prepare || inflight || !canOpenCheckout(uiState)) return;
      inflight = true;
      try {
        await stub.requestPayment(toTossCheckoutRequest(prepare));
      } finally {
        inflight = false;
      }
    },
  };
}
