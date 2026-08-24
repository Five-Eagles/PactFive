import type {
  AgreementRecord,
  ContractRecord,
  DeliveryRecord,
  PaymentRecord,
} from "../server/contract.types";

// Mock — api-contract.md 계약대로 동작하는 가짜 서버. server/의 repository는 아직 실제 DB에
// 연결돼 있지 않으므로(구현 초안 코드일 뿐), spec.md 규칙 검증은 이 in-memory Mock으로 한다
// (features/sample-login/prototype/mock/auth.mock.ts와 동일한 방식).

const PLATFORM_FEE_RATE = 0.1;

function floorFee(paymentAmount: number): number {
  return Math.floor(paymentAmount * PLATFORM_FEE_RATE); // spec.md 규칙 7 (D-14: 1원 미만 버림)
}

// ---- in-memory 상태 ----
let agreements: AgreementRecord[] = [];
let contracts: ContractRecord[] = [];
let payments: PaymentRecord[] = [];
let deliveries: DeliveryRecord[] = [];
let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_mock${String(seq).padStart(4, "0")}`;
}

// project-management 도메인 계약 함수(C-02·C-03·C-04·C-07) 호출 기록 — 호출 순서·횟수 검증용
export const callLog: string[] = [];

type ProjectState = { canceled: boolean; transactionCompleted: boolean };
const PROJECT_STATES: Record<string, ProjectState> = {};

export function seedProject(projectId: string, state: Partial<ProjectState> = {}): void {
  PROJECT_STATES[projectId] = { canceled: false, transactionCompleted: false, ...state };
}

async function mockMarkPaymentPending(projectId: string): Promise<void> {
  callLog.push(`markPaymentPending:${projectId}`);
}

async function mockStartProjectTransaction(projectId: string): Promise<"STARTED" | "PROJECT_CANCELED"> {
  callLog.push(`startProjectTransaction:${projectId}`);
  const state = PROJECT_STATES[projectId];
  if (state?.canceled) return "PROJECT_CANCELED"; // spec.md 규칙 9
  return "STARTED";
}

async function mockCompleteProjectTransaction(projectId: string): Promise<"COMPLETED" | "ALREADY_COMPLETED"> {
  callLog.push(`completeProjectTransaction:${projectId}`);
  const state = PROJECT_STATES[projectId];
  if (state?.transactionCompleted) return "ALREADY_COMPLETED";
  if (state) state.transactionCompleted = true;
  return "COMPLETED";
}

async function mockRestorePreContractProject(
  projectId: string,
  agreementId: string,
  reason: "FREELANCER_REJECTED" | "CLIENT_REJECTED",
): Promise<{ recruitmentStatus: "OPEN"; transactionStatus: "NONE"; reopened: boolean }> {
  callLog.push(`restorePreContractProject:${projectId}:${reason}`);
  return { recruitmentStatus: "OPEN", transactionStatus: "NONE", reopened: true };
}

export function resetMockState(): void {
  agreements = [];
  contracts = [];
  payments = [];
  deliveries = [];
  callLog.length = 0;
}

// ---- spec.md 규칙 1: 금액 합의 제안 ----
export async function mockProposeAgreement(input: {
  applicationId: string;
  agreedAmount: number;
  proposedByUserId: string;
}): Promise<AgreementRecord> {
  const active = agreements.find((a) => a.applicationId === input.applicationId && a.status === "PROPOSED");
  if (active) throw new Error("409: 이미 진행 중인 합의가 있습니다");

  const agreement: AgreementRecord = {
    id: nextId("agr"),
    applicationId: input.applicationId,
    proposedByUserId: input.proposedByUserId,
    agreedAmount: input.agreedAmount,
    status: "PROPOSED",
    respondedAt: null,
    createdAt: new Date().toISOString(),
  };
  agreements.push(agreement);
  return agreement;
}

// ---- spec.md 규칙 2: 합의 수락 → 계약 자동 생성 ----
export async function mockAcceptAgreement(
  agreementId: string,
  responderId: string,
  projectContext: { projectId: string; clientId: string; freelancerId: string; projectTitle: string },
): Promise<{ agreement: AgreementRecord; contract: ContractRecord }> {
  const agreement = agreements.find((a) => a.id === agreementId);
  if (!agreement) throw new Error("404: 합의를 찾을 수 없습니다");
  if (agreement.proposedByUserId === responderId) throw new Error("403: 제안한 본인은 수락할 수 없습니다");
  if (agreement.status !== "PROPOSED") throw new Error("409: 이미 응답된 합의입니다");

  agreement.status = "ACCEPTED";
  agreement.respondedAt = new Date().toISOString();

  const contract: ContractRecord = {
    id: nextId("con"),
    agreementId: agreement.id,
    projectId: projectContext.projectId,
    clientId: projectContext.clientId,
    freelancerId: projectContext.freelancerId,
    projectTitleSnapshot: projectContext.projectTitle,
    agreedAmount: agreement.agreedAmount,
    status: "DRAFT",
    clientSignedAt: null,
    freelancerSignedAt: null,
    signedAt: null,
    canceledAt: null,
  };
  contracts.push(contract);
  return { agreement, contract };
}

// ---- spec.md 규칙 3: 합의 거절 → restorePreContractProject 호출 ----
export async function mockRejectAgreement(
  agreementId: string,
  responderId: string,
  projectId: string,
): Promise<{ agreement: AgreementRecord; reopened: boolean }> {
  const agreement = agreements.find((a) => a.id === agreementId);
  if (!agreement) throw new Error("404: 합의를 찾을 수 없습니다");
  if (agreement.proposedByUserId === responderId) throw new Error("403: 제안한 본인은 거절할 수 없습니다");
  if (agreement.status !== "PROPOSED") throw new Error("409: 이미 응답된 합의입니다");

  agreement.status = "REJECTED";
  agreement.respondedAt = new Date().toISOString();

  const reason = responderId === agreement.proposedByUserId ? "CLIENT_REJECTED" : "FREELANCER_REJECTED";
  const restored = await mockRestorePreContractProject(projectId, agreement.id, reason);
  return { agreement, reopened: restored.reopened };
}

// ---- spec.md 규칙 4: 계약 서명 ----
export async function mockSignContract(input: {
  contractId: string;
  signerId: string;
  signerRole: "CLIENT" | "FREELANCER";
  ipAddress: string;
  userAgent: string;
}): Promise<ContractRecord> {
  const contract = contracts.find((c) => c.id === input.contractId);
  if (!contract) throw new Error("404: 계약을 찾을 수 없습니다");
  if (contract.status !== "DRAFT" && contract.status !== "SIGNING") {
    throw new Error("409: 서명할 수 없는 계약 상태입니다");
  }

  const isClientSigner = input.signerRole === "CLIENT" && input.signerId === contract.clientId;
  const isFreelancerSigner = input.signerRole === "FREELANCER" && input.signerId === contract.freelancerId;
  if (!isClientSigner && !isFreelancerSigner) throw new Error("403: 계약 당사자만 서명할 수 있습니다");
  if (isClientSigner && contract.clientSignedAt) throw new Error("409: 이미 서명했습니다");
  if (isFreelancerSigner && contract.freelancerSignedAt) throw new Error("409: 이미 서명했습니다");

  const signedAt = new Date().toISOString();
  if (isClientSigner) contract.clientSignedAt = signedAt;
  if (isFreelancerSigner) contract.freelancerSignedAt = signedAt;

  const bothSigned = !!contract.clientSignedAt && !!contract.freelancerSignedAt;
  contract.status = bothSigned ? "SIGNED" : "SIGNING";
  contract.signedAt = bothSigned ? signedAt : null;
  return contract;
}

// ---- spec.md 규칙 5~9: 결제 확정 ----
export async function mockConfirmPayment(
  input: { contractId: string; pgProvider: string; pgOrderId: string; pgPaymentKey: string },
  pgOutcome: "APPROVED" | "FAILED" = "APPROVED",
): Promise<PaymentRecord> {
  const contract = contracts.find((c) => c.id === input.contractId);
  if (!contract) throw new Error("404: 계약을 찾을 수 없습니다");
  if (contract.status !== "SIGNED") throw new Error("409: 서명이 완료된 계약만 결제할 수 있습니다");

  await mockMarkPaymentPending(contract.projectId); // 규칙 6 — PG 요청 직전 호출

  const paymentAmount = contract.agreedAmount;
  const platformFeeAmount = floorFee(paymentAmount); // 규칙 7
  const settlementAmount = paymentAmount - platformFeeAmount;

  const payment: PaymentRecord = {
    id: nextId("pay"),
    contractId: contract.id,
    clientId: contract.clientId,
    freelancerId: contract.freelancerId,
    currency: "KRW",
    paymentAmount,
    platformFeeAmount,
    settlementAmount,
    status: pgOutcome === "APPROVED" ? "PAID" : "FAILED", // 규칙 8
    pgProvider: input.pgProvider,
    pgOrderId: input.pgOrderId,
    pgPaymentKey: input.pgPaymentKey,
    paidAt: pgOutcome === "APPROVED" ? new Date().toISOString() : null,
    releasedAt: null,
    failedAt: pgOutcome === "FAILED" ? new Date().toISOString() : null,
    failureCode: pgOutcome === "FAILED" ? "PG_DECLINED" : null,
    failureMessage: pgOutcome === "FAILED" ? "카드 승인이 거절되었습니다" : null,
  };
  payments.push(payment);

  if (payment.status === "PAID") {
    const started = await mockStartProjectTransaction(contract.projectId); // 규칙 9
    if (started === "PROJECT_CANCELED") throw new Error("409: 프로젝트가 취소되었습니다");
  }

  return payment;
}

// ---- spec.md 규칙 11: 납품 요청 ----
export async function mockRequestDelivery(input: {
  contractId: string;
  message?: string;
  attachmentUrl?: string;
}): Promise<DeliveryRecord> {
  const contract = contracts.find((c) => c.id === input.contractId);
  if (!contract) throw new Error("404: 계약을 찾을 수 없습니다");
  if (contract.status !== "SIGNED") throw new Error("409: 서명이 완료된 계약만 납품을 요청할 수 있습니다");

  const delivery: DeliveryRecord = {
    id: nextId("del"),
    contractId: contract.id,
    status: "DELIVERY_REQUESTED",
    message: input.message ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    requestedAt: new Date().toISOString(),
    approvedAt: null,
  };
  deliveries.push(delivery);
  return delivery;
}

// ---- spec.md 규칙 12~13: 납품 승인 → 정산 → completeProjectTransaction ----
export async function mockApproveDelivery(
  deliveryId: string,
): Promise<{ delivery: DeliveryRecord; payment: PaymentRecord }> {
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) throw new Error("404: 납품을 찾을 수 없습니다");
  if (delivery.status !== "DELIVERY_REQUESTED") throw new Error("409: 승인할 수 없는 납품 상태입니다");

  delivery.status = "APPROVED";
  delivery.approvedAt = new Date().toISOString();

  const payment = payments.find((p) => p.contractId === delivery.contractId);
  if (!payment) throw new Error("404: 결제 정보를 찾을 수 없습니다");
  payment.status = "RELEASED"; // 규칙 12
  payment.releasedAt = delivery.approvedAt;

  const contract = contracts.find((c) => c.id === delivery.contractId);
  if (!contract) throw new Error("404: 계약을 찾을 수 없습니다");

  await mockCompleteProjectTransaction(contract.projectId); // 규칙 13

  return { delivery, payment };
}

// ---- spec.md 규칙 10: 취소 시 무효화 (프로젝트 취소로 계약을 더 진행할 수 없을 때) ----
export function mockCancelContractForProjectCancellation(contractId: string): ContractRecord {
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) throw new Error("404: 계약을 찾을 수 없습니다");

  contract.status = "CANCELED";
  contract.canceledAt = new Date().toISOString();

  const agreement = agreements.find((a) => a.id === contract.agreementId);
  if (agreement) agreement.status = "REJECTED";
  // contract_signature_audits는 별도 저장소이며 여기서 지우지 않는다 (규칙 10 — 서명 기록 보존).

  return contract;
}
