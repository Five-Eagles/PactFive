/**
 * contracts-payments 공개 API 웹 쪽 타입.
 * `app/server/src/features/contracts-payments/public-api.types.ts`와 짝이다 —
 * 두 폴더는 서로 import하지 않으므로(app/web/AGENTS.md) 계약대로 각자 선언한다.
 *
 * 2026-09-07 팀장 반영에서 재제안(AGR-02/03)·납품(DLV-01)·정산 조회(SET-01 v2)·취소 조회
 * (CAN-01 v2) 타입을 추가했다 — sync-log.md 2026-09-03(67207c8) 이후 develop에 쌓인
 * #53·#66·#58·#80 4개 PR 분량.
 */

export type AgreementStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
export type ContractStatus = 'DRAFT' | 'SIGNING' | 'SIGNED' | 'CANCELED';
export type PaymentRecordStatus = 'READY' | 'PENDING' | 'PAID' | 'FAILED';
export type DeliveryPaymentStatus = PaymentRecordStatus | 'RELEASED';
export type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
export type ProjectTransactionStatus = 'NONE' | 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
export type NotReopenedReason = 'DEADLINE_PASSED' | 'PENDING_APPLICATIONS_REMAIN';

export type NegotiationOfferView = {
  offerId: string;
  round: number;
  amount: number;
  currency: 'KRW';
  offeredByUserId: string;
};

export type CurrentNegotiationOfferResponse = {
  projectId: string;
  agreementId: string | null;
  agreementStatus: AgreementStatus | null;
  offer: NegotiationOfferView | null;
  offers: NegotiationOfferView[];
  contractId: string | null;
  contractStatus: ContractStatus | null;
  projectTitle: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string | null;
  applicationId: string | null;
  reopened: boolean | null;
  notReopenedReason: NotReopenedReason | null;
};

export type SignContractResponse = {
  contractId: string;
  status: 'SIGNING' | 'SIGNED';
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
    currency: 'KRW';
    projectTitle: string;
  };
  workStartDate: string;
  workEndDate: string;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string | null;
  paymentStatus: PaymentRecordStatus | null;
};

export type PreparePaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  clientKey: string;
};

export type GetPaymentResponse = {
  paymentId: string;
  contractId: string;
  orderId: string;
  amount: number;
  currency: 'KRW';
  platformFeeAmount: number;
  settlementAmount: number;
  status: PaymentRecordStatus;
  projectTitle: string;
  projectTransactionStatus: 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'CANCELED';
  environment: 'SANDBOX';
};

export type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};

export type GetSettlementResponse = {
  paymentId: string;
  contractId: string;
  projectId: string;
  projectTitle: string;
  environment: 'SANDBOX';
  provider: 'MANUAL_SIMULATION';
  currency: 'KRW';
  paymentAmount: number;
  platformFeeRateBps: number;
  platformFeeAmount: number;
  settlementAmount: number;
  paymentStatus: DeliveryPaymentStatus;
  deliveryStatus: DeliveryStatus | null;
  projectTransactionStatus: 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
  canceledAt: string | null;
  releasedAt: string | null;
};

export type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';

export type GetCancellationResponse = {
  projectId: string;
  projectTitle: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  paymentPendingAt: string | null;
  canceledAt: string | null;
  acceptedApplicationId: string | null;
  agreementStatus: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | null;
  contractStatus: ContractStatus | null;
  hasSignatureAudit: boolean;
  postActions: {
    applicationRejection: PostActionResult;
    contractInvalidation: PostActionResult;
    notification: PostActionResult;
  } | null;
};

export type DeliveryStatus = 'IN_PROGRESS' | 'DELIVERY_REQUESTED' | 'APPROVED';

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

export type PrepareDeliveryUploadResponse = {
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
};
