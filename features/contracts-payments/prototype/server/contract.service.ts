import * as repository from "./contract.repository";
import * as projectTransactionClient from "./project-transaction.client";
import type { PaymentGateway } from "./payment.port";
import type {
  AgreementRecord,
  ApproveDeliveryInput,
  ConfirmPaymentInput,
  ContractRecord,
  DeliveryRecord,
  PaymentRecord,
  ProposeAgreementInput,
  RequestDeliveryInput,
  SignContractInput,
} from "./contract.types";

export class ConflictError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

const PLATFORM_FEE_RATE = 0.1; // docs/naming-convention.md §11 상수는 UPPER_SNAKE_CASE

// spec.md 규칙 7: 1원 미만은 버림 (floor)
export function calculatePlatformFeeAmount(paymentAmount: number): number {
  return Math.floor(paymentAmount * PLATFORM_FEE_RATE);
}

export function calculateSettlementAmount(paymentAmount: number): number {
  return paymentAmount - calculatePlatformFeeAmount(paymentAmount);
}

// spec.md 규칙 1
export async function proposeAgreement(input: ProposeAgreementInput): Promise<AgreementRecord> {
  const existing = await repository.findActiveAgreementByApplicationId(input.applicationId);
  if (existing) {
    throw new ConflictError("이미 진행 중인 합의가 있습니다");
  }
  return repository.insertAgreement({
    applicationId: input.applicationId,
    proposedByUserId: input.proposedByUserId,
    agreedAmount: input.agreedAmount,
    status: "PROPOSED",
    respondedAt: null,
  });
}

// spec.md 규칙 2
export async function acceptAgreement(
  agreementId: string,
  responderId: string,
  projectContext: { projectId: string; clientId: string; freelancerId: string; projectTitle: string },
): Promise<{ agreement: AgreementRecord; contract: ContractRecord }> {
  const agreement = await repository.findAgreementById(agreementId);
  if (!agreement) throw new NotFoundError("합의를 찾을 수 없습니다");
  if (agreement.proposedByUserId === responderId) {
    throw new ForbiddenError("제안한 본인은 수락할 수 없습니다");
  }
  if (agreement.status !== "PROPOSED") {
    throw new ConflictError("이미 응답된 합의입니다");
  }

  const respondedAt = new Date().toISOString();
  const updated = await repository.updateAgreementStatus(agreementId, "ACCEPTED", respondedAt);

  const contract = await repository.insertContract({
    agreementId: updated.id,
    projectId: projectContext.projectId,
    clientId: projectContext.clientId,
    freelancerId: projectContext.freelancerId,
    projectTitleSnapshot: projectContext.projectTitle,
    agreedAmount: updated.agreedAmount,
    status: "DRAFT",
    clientSignedAt: null,
    freelancerSignedAt: null,
    signedAt: null,
    canceledAt: null,
  });

  return { agreement: updated, contract };
}

// spec.md 규칙 3
export async function rejectAgreement(
  agreementId: string,
  responderId: string,
  projectId: string,
): Promise<{ agreement: AgreementRecord; projectRestored: projectTransactionClient.RestorePreContractProjectResult }> {
  const agreement = await repository.findAgreementById(agreementId);
  if (!agreement) throw new NotFoundError("합의를 찾을 수 없습니다");
  if (agreement.proposedByUserId === responderId) {
    throw new ForbiddenError("제안한 본인은 거절할 수 없습니다");
  }
  if (agreement.status !== "PROPOSED") {
    throw new ConflictError("이미 응답된 합의입니다");
  }

  const respondedAt = new Date().toISOString();
  const updated = await repository.updateAgreementStatus(agreementId, "REJECTED", respondedAt);

  // 거절한 쪽이 곧 최종 거절 주체. 제안자가 client면 거절자는 freelancer, 반대도 마찬가지.
  const reason: projectTransactionClient.RestorePreContractProjectReason =
    responderId === agreement.proposedByUserId ? "CLIENT_REJECTED" : "FREELANCER_REJECTED";
  const projectRestored = await projectTransactionClient.restorePreContractProject(projectId, agreement.id, reason);

  return { agreement: updated, projectRestored };
}

// spec.md 규칙 4
export async function signContract(input: SignContractInput): Promise<ContractRecord> {
  const contract = await repository.findContractById(input.contractId);
  if (!contract) throw new NotFoundError("계약을 찾을 수 없습니다");
  if (contract.status !== "DRAFT" && contract.status !== "SIGNING") {
    throw new ConflictError("서명할 수 없는 계약 상태입니다");
  }
  const isClientSigner = input.signerRole === "CLIENT" && input.signerId === contract.clientId;
  const isFreelancerSigner = input.signerRole === "FREELANCER" && input.signerId === contract.freelancerId;
  if (!isClientSigner && !isFreelancerSigner) {
    throw new ForbiddenError("계약 당사자만 서명할 수 있습니다");
  }
  if (isClientSigner && contract.clientSignedAt) {
    throw new ConflictError("이미 서명했습니다");
  }
  if (isFreelancerSigner && contract.freelancerSignedAt) {
    throw new ConflictError("이미 서명했습니다");
  }

  const signedAt = new Date().toISOString();
  await repository.insertContractSignatureAudit({
    contractId: contract.id,
    signerId: input.signerId,
    signerRole: input.signerRole,
    signedAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  const patch: Partial<ContractRecord> = isClientSigner ? { clientSignedAt: signedAt } : { freelancerSignedAt: signedAt };
  const nextClientSignedAt = isClientSigner ? signedAt : contract.clientSignedAt;
  const nextFreelancerSignedAt = isFreelancerSigner ? signedAt : contract.freelancerSignedAt;
  const bothSigned = !!nextClientSignedAt && !!nextFreelancerSignedAt;

  return repository.updateContract(contract.id, {
    ...patch,
    status: bothSigned ? "SIGNED" : "SIGNING",
    signedAt: bothSigned ? signedAt : null,
  });
}

// spec.md 규칙 5~9
export async function confirmPayment(
  input: ConfirmPaymentInput,
  paymentGateway: PaymentGateway,
): Promise<PaymentRecord> {
  const contract = await repository.findContractById(input.contractId);
  if (!contract) throw new NotFoundError("계약을 찾을 수 없습니다");
  if (contract.status !== "SIGNED") {
    throw new ConflictError("서명이 완료된 계약만 결제할 수 있습니다");
  }

  // 규칙 6: PG 요청 직전 markPaymentPending(C-07) 호출
  await projectTransactionClient.markPaymentPending(contract.projectId);

  const paymentAmount = contract.agreedAmount;
  const platformFeeAmount = calculatePlatformFeeAmount(paymentAmount); // 규칙 7
  const settlementAmount = calculateSettlementAmount(paymentAmount);

  const result = await paymentGateway.confirmPayment({
    pgOrderId: input.pgOrderId,
    pgPaymentKey: input.pgPaymentKey,
    paymentAmount,
  });

  const payment = await repository.insertPayment({
    contractId: contract.id,
    clientId: contract.clientId,
    freelancerId: contract.freelancerId,
    currency: "KRW",
    paymentAmount,
    platformFeeAmount,
    settlementAmount,
    status: result.outcome === "APPROVED" ? "PAID" : "FAILED", // 규칙 8
    pgProvider: input.pgProvider,
    pgOrderId: input.pgOrderId,
    pgPaymentKey: input.pgPaymentKey,
    paidAt: result.outcome === "APPROVED" ? result.paidAt : null,
    releasedAt: null,
    failedAt: result.outcome === "FAILED" ? new Date().toISOString() : null,
    failureCode: result.outcome === "FAILED" ? result.failureCode : null,
    failureMessage: result.outcome === "FAILED" ? result.failureMessage : null,
  });

  if (payment.status === "PAID") {
    // 규칙 9: 계약 SIGNED + 결제 PAID 둘 다 될 때 1회 호출
    const started = await projectTransactionClient.startProjectTransaction(contract.projectId);
    if (started.outcome === "PROJECT_CANCELED") {
      throw new ConflictError("프로젝트가 취소되었습니다");
    }
  }

  return payment;
}

// spec.md 규칙 11
export async function requestDelivery(input: RequestDeliveryInput): Promise<DeliveryRecord> {
  const contract = await repository.findContractById(input.contractId);
  if (!contract) throw new NotFoundError("계약을 찾을 수 없습니다");
  if (contract.status !== "SIGNED") {
    throw new ConflictError("서명이 완료된 계약만 납품을 요청할 수 있습니다");
  }
  return repository.upsertDeliveryRequested(contract.id, {
    message: input.message,
    attachmentUrl: input.attachmentUrl,
    requestedAt: new Date().toISOString(),
  });
}

// spec.md 규칙 12~13
export async function approveDelivery(
  input: ApproveDeliveryInput,
  contractId: string,
): Promise<{ delivery: DeliveryRecord; payment: PaymentRecord }> {
  const delivery = await repository.findDeliveryById(input.deliveryId);
  if (!delivery) throw new NotFoundError("납품을 찾을 수 없습니다");
  if (delivery.status !== "DELIVERY_REQUESTED") {
    throw new ConflictError("승인할 수 없는 납품 상태입니다");
  }

  const approvedAt = new Date().toISOString();
  const updatedDelivery = await repository.updateDelivery(delivery.id, { status: "APPROVED", approvedAt });

  const payment = await repository.findPaymentByContractId(delivery.contractId);
  if (!payment) throw new NotFoundError("결제 정보를 찾을 수 없습니다");
  const updatedPayment = await repository.updatePayment(payment.id, {
    status: "RELEASED",
    releasedAt: approvedAt,
  });

  const contract = await repository.findContractById(delivery.contractId);
  if (!contract) throw new NotFoundError("계약을 찾을 수 없습니다");

  // 규칙 13: 납품 APPROVED + 정산 RELEASED 둘 다 될 때 1회 호출
  const completed = await projectTransactionClient.completeProjectTransaction(contract.projectId);
  if (completed.outcome === "CONFLICT") {
    throw new ConflictError("프로젝트 거래를 완료 처리할 수 없습니다");
  }

  return { delivery: updatedDelivery, payment: updatedPayment };
}
