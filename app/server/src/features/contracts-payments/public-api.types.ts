import type { AgreementStatus, ContractStatus } from './contract.types';
import type {
  NotReopenedReason,
  ProjectTransactionStatus,
  RecruitmentStatus,
} from './project-transaction.types';

export type { AgreementStatus, ContractStatus } from './contract.types';
export type { NotReopenedReason, ProjectTransactionStatus, RecruitmentStatus };

/**
 * 공개 API 타입 + 컨트롤러 인증 컨텍스트.
 *
 * 원본: features/contracts-payments/prototype/server/public-api.types.ts (28471d6, #80).
 * api-contract.md "공개 API 초안" 절이 정본. 내부 계약 4함수(project-transaction.*)와
 * 에러 코드 체계를 섞지 않는다 (PublicApiError는 401·403 전용, DomainContractError는
 * 404·409·422 전용).
 */

export type AuthContext = { userId: string; role: 'CLIENT' | 'FREELANCER' };

export type PublicApiErrorCode = 'AUTH_REQUIRED' | 'PROJECT_FORBIDDEN';

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
    this.name = 'PublicApiError';
    this.httpStatus = code === 'AUTH_REQUIRED' ? 401 : 403;
    this.body = { error: { code, message, details: null } };
  }
}

export function isPublicApiError(err: unknown): err is PublicApiError {
  return err instanceof PublicApiError;
}

// ---------------------------------------------------------------------------
// 합의 (Increment 1 + AGR-02/03)
// ---------------------------------------------------------------------------

export type ProposeNegotiationOfferInput = { amount: number; currency: 'KRW' };

export type CounterNegotiationOfferInput = {
  amount: number;
  currency: 'KRW';
  expectedRound: number;
};

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

export type AcceptNegotiationOfferInput = { expectedRound: number };

export type RejectNegotiationOfferInput = { reasonCode: string; reason?: string };

// ---------------------------------------------------------------------------
// 서명 (CTR-01/02)
// ---------------------------------------------------------------------------

export type SignContractResponse = {
  contractId: string;
  status: 'SIGNING' | 'SIGNED';
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  alreadyProcessed: boolean;
};

export type PaymentRecordStatus = 'READY' | 'PENDING' | 'PAID' | 'FAILED';
export type DeliveryPaymentStatus = PaymentRecordStatus | 'RELEASED';

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

// ---------------------------------------------------------------------------
// 결제 (PAY-01/02)
// ---------------------------------------------------------------------------

export type PreparePaymentInput = { contractId: string };

export type PreparePaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  clientKey: string;
};

export type PaymentProjectTransactionStatus = 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'CANCELED';

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
  projectTransactionStatus: PaymentProjectTransactionStatus;
  environment: 'SANDBOX';
};

export type ConfirmPaymentInput = { orderId: string; amount: number; paymentKey: string };

export type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};

// ---------------------------------------------------------------------------
// 정산 조회 (SET-01 v2, spec.md 규칙 24) — 사용자 API는 GET only.
// ---------------------------------------------------------------------------

export type SettlementProjectTransactionStatus =
  | 'CONTRACT_PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';

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
  projectTransactionStatus: SettlementProjectTransactionStatus;
  canceledAt: string | null;
  releasedAt: string | null;
};

/** 브라우저 경로가 아니다(spec.md 규칙 24) — 내부 시뮬레이션 헬퍼가 쓰는 입력 모양만 고정. */
export type SimulateSettlementResultInput = {
  result: 'SUCCESS' | 'FAILURE' | 'UNKNOWN';
  idempotencyKey: string;
};

export type SettlementExecutionStatus =
  | 'PENDING'
  | 'BLOCKED'
  | 'ELIGIBLE'
  | 'REQUESTED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REVIEW_REQUIRED';

export type SettlementExecutionView = {
  settlementId: string;
  paymentId: string;
  contractId: string;
  status: SettlementExecutionStatus;
  paymentAmount: number;
  platformFeeRateBps: number;
  platformFeeAmount: number;
  settlementAmount: number;
  feePolicyVersion: string;
  pgCostAmount: number;
  blockedReason: string | null;
  payoutAttempts: number;
  releasedAt: string | null;
};

export type SimulateSettlementResultResponse = {
  alreadyProcessed: boolean;
  paymentStatus: DeliveryPaymentStatus;
  executionStatus: SettlementExecutionStatus;
  payoutAttempts: number;
};

// ---------------------------------------------------------------------------
// 취소 조회 (CAN-01 v2, spec.md 규칙 25)
// ---------------------------------------------------------------------------

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

/** 인바운드 — 유동우(project-management) → 조준영. `/internal/v1/.../invalidate-agreement`. */
export type InvalidateAgreementInput = {
  /** 유동우 호출 키. 없으면 cancellationEventId와 같다. */
  cancellationId?: string;
  /** 설계서 v2.0 별칭. 있으면 cancellationId와 같은 사건으로 본다. */
  cancellationEventId?: string;
  actorUserId: string;
  reason: 'PROJECT_CANCELED';
  /** 유동우 호출 시각. 없으면 occurredAt과 같다. */
  projectCanceledAt?: string;
  requestId: string;
  idempotencyKey: string;
  occurredAt?: string;
};

export type InvalidateAgreementResponse = {
  alreadyProcessed: boolean;
  result: PostActionResult;
  /** 설계서 v2.0. result와 같은 값이다. */
  state: PostActionResult;
  projectId: string;
  agreementStatus: 'REJECTED' | null;
  contractStatus: 'CANCELED' | null;
  signaturesPreserved: boolean;
  changed: boolean;
};

// ---------------------------------------------------------------------------
// 납품 (DLV-01, spec.md 규칙 23)
// ---------------------------------------------------------------------------

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
