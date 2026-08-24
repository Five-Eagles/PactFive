import { useState } from "react";
import * as contractApi from "./api/contract";
import type { ContractResponse, DeliveryResponse, PaymentResponse } from "../server/contract.types";

// 브라우저 프리뷰(npm run preview:dev)에서 화면을 보여주기 위한 로컬 초기값이다. 실제 데이터는
// 서버 API에서 받아온다 — 여기서는 UI 골격 확인용 placeholder일 뿐이다.
function initialContract(contractId: string): ContractResponse {
  return {
    id: contractId,
    agreementId: "agr_mock0001",
    projectId: "prj_mock0001",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitleSnapshot: "쇼핑몰 리뉴얼",
    agreedAmount: 1_000_000,
    status: "SIGNED",
    clientSignedAt: "2026-08-24T11:00:00Z",
    freelancerSignedAt: "2026-08-24T11:05:00Z",
    signedAt: "2026-08-24T11:05:00Z",
    canceledAt: null,
  };
}

function initialPayment(contractId: string): PaymentResponse {
  return {
    id: "pay_mock0001",
    contractId,
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    currency: "KRW",
    paymentAmount: 1_000_000,
    platformFeeAmount: 100_000,
    settlementAmount: 900_000,
    status: "PAID",
    pgProvider: "TOSS",
    pgOrderId: "order_mock0001",
    pgPaymentKey: "pg_key_mock",
    paidAt: "2026-08-24T12:00:00Z",
    releasedAt: null,
    failedAt: null,
    failureCode: null,
    failureMessage: null,
  };
}

function initialDelivery(contractId: string): DeliveryResponse {
  return {
    id: "del_mock0001",
    contractId,
    status: "DELIVERY_REQUESTED",
    message: null,
    attachmentUrl: null,
    requestedAt: "2026-08-25T09:00:00Z",
    approvedAt: null,
  };
}

export function useContract(contractId: string) {
  const [contract, setContract] = useState<ContractResponse>(() => initialContract(contractId));
  const [payment, setPayment] = useState<PaymentResponse>(() => initialPayment(contractId));
  const [delivery, setDelivery] = useState<DeliveryResponse>(() => initialDelivery(contractId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sign = async () => {
    setErrorMessage(null);
    try {
      const result = await contractApi.signContract(contract.id, {
        ipAddress: "0.0.0.0",
        userAgent: navigator.userAgent,
      });
      setContract(result);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const pay = async () => {
    setErrorMessage(null);
    try {
      const result = await contractApi.confirmPayment({
        contractId: contract.id,
        pgProvider: "TOSS",
        pgOrderId: `order_${contract.id}`,
        pgPaymentKey: `pg_key_${contract.id}`,
      });
      setPayment(result);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const requestDelivery = async () => {
    setErrorMessage(null);
    try {
      const result = await contractApi.requestDelivery({ contractId: contract.id });
      setDelivery(result);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const approveDelivery = async () => {
    setErrorMessage(null);
    try {
      const result = await contractApi.approveDelivery(delivery.id, contract.id);
      setDelivery(result);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  return { contract, payment, delivery, errorMessage, sign, pay, requestDelivery, approveDelivery };
}
