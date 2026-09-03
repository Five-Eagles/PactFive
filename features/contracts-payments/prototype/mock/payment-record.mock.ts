import {
  PaymentGatewayError,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type PaymentGateway,
} from "../server/payment.port";
import { ignoreNotificationFailure, type NotificationTriggerPort } from "../server/notification.port";
import { DomainContractError } from "../server/project-transaction.types";
import { createPaymentGatewayMock, MOCK_CONFIRMED_AMOUNT } from "./payment.mock";

export type PaymentRecordStatus = "READY" | "PENDING" | "PAID" | "FAILED";

export type PreparePaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  clientKey: string;
};

export type GetPaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  status: PaymentRecordStatus;
};

type PaymentRecord = {
  paymentId: string;
  orderId: string;
  amount: number;
  status: PaymentRecordStatus;
  failedAt: string | null;
  failureCode: string | null;
  rawResponse: { code: string; message: string } | null;
};

export const MOCK_PAYMENT_ID = "pay_mock_01";
const MOCK_CLIENT_KEY = "mock_pg_client_key";
const MOCK_FAILED_AT = "2026-08-25T05:10:00Z";
const MOCK_PAID_AT = "2026-08-25T05:12:00Z";
const MOCK_NOTIFY_PROJECT_ID = "prj_alive";
const MOCK_NOTIFY_FREELANCER_ID = "usr_freelancer_b";

export type PaymentRecordMockOptions = {
  notifications?: NotificationTriggerPort;
  projectId?: string;
  freelancerId?: string;
};

/** 테스트마다 새 결제 행을 만든다. I-17 계약당 1행. */
export function createPaymentRecordMock(
  gateway: PaymentGateway = createPaymentGatewayMock(),
  options: PaymentRecordMockOptions = {},
): {
  preparePayment(amount?: number): PreparePaymentResponse;
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse>;
  retryPayment(paymentId: string): GetPaymentResponse;
  getPayment(paymentId: string): GetPaymentResponse;
} {
  let orderSeq = 0;
  let row: PaymentRecord | null = null;
  const projectId = options.projectId ?? MOCK_NOTIFY_PROJECT_ID;
  const freelancerId = options.freelancerId ?? MOCK_NOTIFY_FREELANCER_ID;

  function nextOrderId(): string {
    orderSeq += 1;
    return `ord_mock_${String(orderSeq).padStart(2, "0")}`;
  }

  function requireRow(paymentId: string): PaymentRecord {
    if (!row || row.paymentId !== paymentId) {
      throw new DomainContractError("PROJECT_NOT_FOUND", "결제를 찾을 수 없습니다.");
    }
    return row;
  }

  function toGetResponse(record: PaymentRecord): GetPaymentResponse {
    return {
      paymentId: record.paymentId,
      orderId: record.orderId,
      amount: record.amount,
      status: record.status,
    };
  }

  return {
    preparePayment(amount: number = MOCK_CONFIRMED_AMOUNT): PreparePaymentResponse {
      // 이미 있으면 I-17대로 같은 행만 돌려준다.
      if (row) {
        if (row.status !== "READY") {
          throw new DomainContractError(
            "PROJECT_TRANSITION_CONFLICT",
            "프로젝트 상태가 변경되어 처리할 수 없습니다.",
          );
        }
        return {
          paymentId: row.paymentId,
          orderId: row.orderId,
          amount: row.amount,
          clientKey: MOCK_CLIENT_KEY,
        };
      }
      row = {
        paymentId: MOCK_PAYMENT_ID,
        orderId: nextOrderId(),
        amount,
        status: "READY",
        failedAt: null,
        failureCode: null,
        rawResponse: null,
      };
      return {
        paymentId: row.paymentId,
        orderId: row.orderId,
        amount: row.amount,
        clientKey: MOCK_CLIENT_KEY,
      };
    },

    async confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResponse> {
      if (!row) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "결제를 찾을 수 없습니다.");
      }
      // 교체된 주문은 승인하지 않는다.
      if (input.orderId !== row.orderId) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      // 실패·완료 주문은 재confirm하지 않는다.
      if (row.status !== "READY" && row.status !== "PENDING") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      row.status = "PENDING";
      try {
        const paid = await gateway.confirmPayment(input);
        row.status = "PAID";
        row.failedAt = null;
        row.failureCode = null;
        row.rawResponse = null;
        const notifications = options.notifications;
        const paymentId = row.paymentId;
        // PAID 확정 뒤에만 발행한다. throw여도 행은 PAID로 둔다.
        if (notifications) {
          await ignoreNotificationFailure(() =>
            notifications.publishPaymentCompleted({
              type: "PAYMENT_COMPLETED",
              projectId,
              paymentId,
              freelancerId,
              occurredAt: MOCK_PAID_AT,
            }),
          );
        }
        return paid;
      } catch (err) {
        if (err instanceof PaymentGatewayError) {
          row.status = "FAILED";
          row.failedAt = MOCK_FAILED_AT;
          row.failureCode = err.code;
          row.rawResponse = { code: err.code, message: err.message };
        }
        throw err;
      }
    },

    retryPayment(paymentId: string): GetPaymentResponse {
      const record = requireRow(paymentId);
      // FAILED만 같은 행에 새 주문을 넣는다.
      if (record.status !== "FAILED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      record.orderId = nextOrderId();
      record.status = "READY";
      record.failedAt = null;
      record.failureCode = null;
      record.rawResponse = null;
      return toGetResponse(record);
    },

    getPayment(paymentId: string): GetPaymentResponse {
      return toGetResponse(requireRow(paymentId));
    },
  };
}
