import type { AgreementRecord, ContractRecord, DeliveryRecord, PaymentRecord } from "./contract.types";

// 실제 구현에서는 Prisma client를 사용한다. 이 파일은 계층 구조(controller/service/repository)
// 패턴을 보여주기 위한 구현 초안이며, 팀장 통합 시 app/server/prisma/의 실제 스키마에 맞게
// 다시 구현된다 (sdd-framework/integration-workflow.md).

export async function findAgreementById(agreementId: string): Promise<AgreementRecord | null> {
  // SELECT * FROM agreements WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function findActiveAgreementByApplicationId(applicationId: string): Promise<AgreementRecord | null> {
  // SELECT * FROM agreements WHERE application_id = $1 AND status = 'PROPOSED'
  throw new Error("prototype only — not implemented");
}

export async function insertAgreement(input: Omit<AgreementRecord, "id" | "createdAt">): Promise<AgreementRecord> {
  // INSERT INTO agreements (...) VALUES (...)
  throw new Error("prototype only — not implemented");
}

export async function updateAgreementStatus(
  agreementId: string,
  status: AgreementRecord["status"],
  respondedAt: string,
): Promise<AgreementRecord> {
  // UPDATE agreements SET status = $2, responded_at = $3 WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function findContractById(contractId: string): Promise<ContractRecord | null> {
  // SELECT * FROM contracts WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function insertContract(input: Omit<ContractRecord, "id">): Promise<ContractRecord> {
  // INSERT INTO contracts (...) VALUES (...)
  throw new Error("prototype only — not implemented");
}

export async function updateContract(contractId: string, patch: Partial<ContractRecord>): Promise<ContractRecord> {
  // UPDATE contracts SET ... WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function insertContractSignatureAudit(input: {
  contractId: string;
  signerId: string;
  signerRole: "CLIENT" | "FREELANCER";
  signedAt: string;
  ipAddress: string;
  userAgent: string;
}): Promise<void> {
  // INSERT INTO contract_signature_audits (...) VALUES (...)
  throw new Error("prototype only — not implemented");
}

export async function findPaymentByContractId(contractId: string): Promise<PaymentRecord | null> {
  // SELECT * FROM payments WHERE contract_id = $1
  throw new Error("prototype only — not implemented");
}

export async function insertPayment(input: Omit<PaymentRecord, "id">): Promise<PaymentRecord> {
  // INSERT INTO payments (...) VALUES (...)
  throw new Error("prototype only — not implemented");
}

export async function updatePayment(paymentId: string, patch: Partial<PaymentRecord>): Promise<PaymentRecord> {
  // UPDATE payments SET ... WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function findDeliveryById(deliveryId: string): Promise<DeliveryRecord | null> {
  // SELECT * FROM deliveries WHERE id = $1
  throw new Error("prototype only — not implemented");
}

export async function upsertDeliveryRequested(
  contractId: string,
  input: { message?: string; attachmentUrl?: string; requestedAt: string },
): Promise<DeliveryRecord> {
  // INSERT ... ON CONFLICT (contract_id) DO UPDATE SET status = 'DELIVERY_REQUESTED', ...
  throw new Error("prototype only — not implemented");
}

export async function updateDelivery(deliveryId: string, patch: Partial<DeliveryRecord>): Promise<DeliveryRecord> {
  // UPDATE deliveries SET ... WHERE id = $1
  throw new Error("prototype only — not implemented");
}
