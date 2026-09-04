import type { ContractStatus } from "./contract.types";
import type {
  NotReopenedReason,
  ProjectTransactionStatus,
  RecruitmentStatus,
} from "./project-transaction.types";

export type { AgreementStatus, ContractStatus } from "./contract.types";
export type { NotReopenedReason, ProjectTransactionStatus, RecruitmentStatus };

export type PublicApiErrorCode = "AUTH_REQUIRED" | "PROJECT_FORBIDDEN";

export type PublicApiErrorBody = {
  error: {
    code: PublicApiErrorCode;
    message: string;
    details: null;
  };
};

/** 공개 API 401·403. 내부 4함수 5종 코드와 섞지 않는다. */
export class PublicApiError extends Error {
  readonly httpStatus: 401 | 403;
  readonly body: PublicApiErrorBody;

  constructor(code: PublicApiErrorCode, message: string) {
    super(message);
    this.name = "PublicApiError";
    this.httpStatus = code === "AUTH_REQUIRED" ? 401 : 403;
    this.body = { error: { code, message, details: null } };
  }
}

export function isPublicApiError(err: unknown): err is PublicApiError {
  return err instanceof PublicApiError;
}

export type ProposeNegotiationOfferInput = { amount: number; currency: "KRW" };

export type CounterNegotiationOfferInput = {
  amount: number;
  currency: "KRW";
  expectedRound: number;
};

export type NegotiationOfferView = {
  offerId: string;
  round: number;
  amount: number;
  currency: "KRW";
  offeredByUserId: string;
};

export type CurrentNegotiationOfferResponse = {
  projectId: string;
  agreementId: string | null;
  agreementStatus: "PROPOSED" | "ACCEPTED" | "REJECTED" | null;
  offer: NegotiationOfferView | null;
  contractId: string | null;
  contractStatus: ContractStatus | null;
  projectTitle: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string | null;
  applicationId: string | null;
  reopened: boolean | null;
  notReopenedReason: NotReopenedReason | null;
  offers: NegotiationOfferView[];
};

export type AcceptNegotiationOfferInput = { expectedRound: number };

export type RejectNegotiationOfferInput = { reasonCode: string; reason?: string };

export type SignContractResponse = {
  contractId: string;
  status: "SIGNING" | "SIGNED";
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  alreadyProcessed: boolean;
};

export type GetContractResponse = {
  contractId: string;
  projectId: string;
  status: ContractStatus;
  termsSnapshot: {
    schemaVersion: 1;
    amount: number;
    currency: "KRW";
    projectTitle: string;
  };
  workStartDate: string;
  workEndDate: string;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string | null;
  paymentStatus: "READY" | "PENDING" | "PAID" | "FAILED" | null;
};

export type PaymentProjectTransactionStatus = "CONTRACT_PENDING" | "IN_PROGRESS" | "CANCELED";

export type GetPaymentResponse = {
  paymentId: string;
  contractId: string;
  orderId: string;
  amount: number;
  currency: "KRW";
  platformFeeAmount: number;
  settlementAmount: number;
  status: "READY" | "PENDING" | "PAID" | "FAILED";
  projectTitle: string;
  projectTransactionStatus: PaymentProjectTransactionStatus;
  environment: "SANDBOX";
};

export type InvalidateAgreementInput = {
  cancellationId: string;
  actorUserId: string;
  reason: "PROJECT_CANCELED";
  projectCanceledAt: string;
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
};

export type InvalidateAgreementResponse = {
  alreadyProcessed: boolean;
  result: "DONE" | "NOT_NEEDED" | "FAILED";
};

export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";

export type GetCancellationResponse = {
  projectId: string;
  projectTitle: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  paymentPendingAt: string | null;
  canceledAt: string | null;
  acceptedApplicationId: string | null;
  agreementStatus: "PROPOSED" | "ACCEPTED" | "REJECTED" | null;
  contractStatus: ContractStatus | null;
  hasSignatureAudit: boolean;
  postActions: {
    applicationRejection: PostActionResult;
    contractInvalidation: PostActionResult;
  } | null;
};

export type DeliveryStatus = "IN_PROGRESS" | "DELIVERY_REQUESTED" | "APPROVED";

export type DeliveryPaymentStatus = "READY" | "PENDING" | "PAID" | "FAILED" | "RELEASED";

export type SettlementProjectTransactionStatus =
  | "CONTRACT_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

export type GetSettlementResponse = {
  paymentId: string;
  contractId: string;
  projectId: string;
  projectTitle: string;
  environment: "SANDBOX";
  provider: "MANUAL_SIMULATION";
  currency: "KRW";
  paymentAmount: number;
  platformFeeRateBps: number;
  platformFeeAmount: number;
  settlementAmount: number;
  paymentStatus: DeliveryPaymentStatus;
  deliveryStatus: DeliveryStatus | null;
  projectTransactionStatus: SettlementProjectTransactionStatus;
  canceledAt: string | null;
};

export type DeliveryFileView = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type DeliveryView = {
  deliveryId: string;
  status: DeliveryStatus;
  version: number;
  message: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  file: DeliveryFileView | null;
};

export type GetDeliveryResponse = {
  contractId: string;
  projectId: string;
  projectTitle: string;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string | null;
  contractStatus: ContractStatus;
  agreedAmount: number;
  delivery: DeliveryView | null;
  paymentStatus: DeliveryPaymentStatus;
  downloadUrl: string | null;
  canRequestDelivery: boolean;
  canApprove: boolean;
  canDownload: boolean;
  canReview: boolean;
  alreadyProcessed?: boolean;
};

export type PrepareDeliveryUploadInput = {
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
};

export type PrepareDeliveryUploadResponse = {
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
};

export type RequestDeliveryInput = {
  objectKey: string;
  uploadId: string;
  message: string;
  idempotencyKey: string;
};

export type ApproveDeliveryInput = { expectedVersion?: number; idempotencyKey: string };
