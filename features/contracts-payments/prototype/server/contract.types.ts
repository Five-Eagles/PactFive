export type AgreementStatus = "PROPOSED" | "ACCEPTED" | "REJECTED";
export type ContractStatus = "DRAFT" | "SIGNING" | "SIGNED" | "CANCELED";
export type PaymentStatus = "READY" | "PENDING" | "PAID" | "FAILED" | "RELEASED" | "REFUNDED";
export type DeliveryStatus = "IN_PROGRESS" | "DELIVERY_REQUESTED" | "APPROVED";
export type UserRole = "CLIENT" | "FREELANCER";

export type AgreementRecord = {
  id: string;
  applicationId: string;
  proposedByUserId: string;
  agreedAmount: number;
  status: AgreementStatus;
  respondedAt: string | null;
  createdAt: string;
};

export type ContractRecord = {
  id: string;
  agreementId: string;
  projectId: string;
  clientId: string;
  freelancerId: string;
  projectTitleSnapshot: string;
  agreedAmount: number;
  status: ContractStatus;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  canceledAt: string | null;
};

export type PaymentRecord = {
  id: string;
  contractId: string;
  clientId: string;
  freelancerId: string;
  currency: string;
  paymentAmount: number;
  platformFeeAmount: number;
  settlementAmount: number;
  status: PaymentStatus;
  pgProvider: string;
  pgOrderId: string;
  pgPaymentKey: string | null;
  paidAt: string | null;
  releasedAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type DeliveryRecord = {
  id: string;
  contractId: string;
  status: DeliveryStatus;
  message: string | null;
  attachmentUrl: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
};

// ---- DTO (naming-convention.md §6) ----

export type ProposeAgreementInput = { applicationId: string; agreedAmount: number; proposedByUserId: string };
export type SignContractInput = { contractId: string; signerId: string; signerRole: UserRole; ipAddress: string; userAgent: string };
export type ConfirmPaymentInput = { contractId: string; pgProvider: string; pgOrderId: string; pgPaymentKey: string };
export type RequestDeliveryInput = { contractId: string; message?: string; attachmentUrl?: string };
export type ApproveDeliveryInput = { deliveryId: string };

// ---- 프론트에서 쓰는 응답 타입 (api-contract.md와 동일한 모양) ----
export type ContractResponse = ContractRecord;
export type PaymentResponse = PaymentRecord;
export type DeliveryResponse = DeliveryRecord;
