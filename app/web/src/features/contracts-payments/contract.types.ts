/**
 * contracts-payments 공개 API 7종의 web 쪽 타입.
 * `app/server/src/features/contracts-payments/public-api.types.ts`와 짝이다 —
 * 두 폴더는 서로 import하지 않으므로(app/web/AGENTS.md) 계약대로 각자 선언한다.
 */

export type AgreementStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
export type ContractStatus = 'DRAFT' | 'SIGNING' | 'SIGNED' | 'CANCELED';
export type PaymentRecordStatus = 'READY' | 'PENDING' | 'PAID' | 'FAILED';

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

export type PreparePaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  clientKey: string;
};

export type GetPaymentResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  status: PaymentRecordStatus;
};

export type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};
