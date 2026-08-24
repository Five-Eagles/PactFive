import type { ContractResponse, DeliveryResponse, PaymentResponse } from "../../server/contract.types";

// API 함수는 HTTP 메서드가 아닌 비즈니스 행위 중심 (docs/naming-convention.md §5)

export async function signContract(
  contractId: string,
  input: { ipAddress: string; userAgent: string },
): Promise<ContractResponse> {
  const res = await fetch(`/contracts/${contractId}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("계약 서명에 실패했습니다");
  return res.json();
}

export async function confirmPayment(input: {
  contractId: string;
  pgProvider: string;
  pgOrderId: string;
  pgPaymentKey: string;
}): Promise<PaymentResponse> {
  const res = await fetch("/payments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("결제 확정에 실패했습니다");
  return res.json();
}

export async function requestDelivery(input: {
  contractId: string;
  message?: string;
  attachmentUrl?: string;
}): Promise<DeliveryResponse> {
  const res = await fetch("/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("납품 요청에 실패했습니다");
  return res.json();
}

export async function approveDelivery(deliveryId: string, contractId: string): Promise<DeliveryResponse> {
  const res = await fetch(`/deliveries/${deliveryId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contractId }),
  });
  if (!res.ok) throw new Error("납품 승인에 실패했습니다");
  return res.json();
}
