import type { AgreementStatus, ContractStatus } from './contract.types';

/**
 * 공개 API 7종 (합의·서명·결제) 타입 + 컨트롤러 인증 컨텍스트.
 *
 * 원본: features/contracts-payments/prototype/server/public-api.types.ts (67207c8)
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

export type ProposeNegotiationOfferInput = { amount: number; currency: 'KRW' };

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
  contractId: string | null;
  contractStatus: ContractStatus | null;
};

export type AcceptNegotiationOfferInput = { expectedRound: number };

export type RejectNegotiationOfferInput = { reasonCode: string; reason?: string };

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
  status: ContractStatus;
  termsSnapshot: {
    schemaVersion: 1;
    amount: number;
    currency: 'KRW';
    projectTitle: string;
  };
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
};

export type PreparePaymentInput = { contractId: string };

export type PreparePaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  clientKey: string;
};

export type PaymentRecordStatus = 'READY' | 'PENDING' | 'PAID' | 'FAILED';

export type GetPaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  status: PaymentRecordStatus;
};

export type ConfirmPaymentInput = { orderId: string; amount: number; paymentKey: string };

export type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};
