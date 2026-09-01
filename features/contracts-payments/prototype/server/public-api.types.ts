import type { ContractStatus } from "./contract.types";

export type { AgreementStatus, ContractStatus } from "./contract.types";

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
  status: ContractStatus;
  termsSnapshot: {
    schemaVersion: 1;
    amount: number;
    currency: "KRW";
    projectTitle: string;
  };
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
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
