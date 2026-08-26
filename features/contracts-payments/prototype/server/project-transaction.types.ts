export type RecruitmentStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type ProjectTransactionStatus =
  | "NONE"
  | "CONTRACT_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";
export type RestoreReason = "FREELANCER_REJECTED" | "CLIENT_REJECTED";
export type NotReopenedReason = "DEADLINE_PASSED" | "PENDING_APPLICATIONS_REMAIN";

export type DomainContractErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_TRANSITION_CONFLICT"
  | "PROJECT_VERSION_CONFLICT"
  | "PROJECT_ALREADY_RESTORED"
  | "VALIDATION_ERROR";

export type DomainContractErrorBody = {
  error: {
    code: DomainContractErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

export type DomainContractEnvelopeInput = {
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
  expectedProjectVersion?: number;
};

export type DomainContractEnvelopeResponse = {
  alreadyProcessed: boolean;
  processedAt: string;
  changed: boolean;
  projectVersion: number;
};

export type ProjectNegotiationContextResponse = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string;
  canceledAt: string | null;
  paymentPendingAt: string | null;
  projectVersion: number;
};

export type MarkPaymentPendingInput = DomainContractEnvelopeInput & {
  contractId: string;
};

export type MarkPaymentPendingResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  transactionStatus: ProjectTransactionStatus;
  paymentPendingAt: string;
};

export type StartProjectTransactionInput = DomainContractEnvelopeInput & {
  expectedProjectVersion: number;
};

export type StartProjectTransactionResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: "IN_PROGRESS";
};

export type CompleteProjectTransactionInput = DomainContractEnvelopeInput & {
  expectedProjectVersion: number;
};

export type CompleteProjectTransactionResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: "COMPLETED";
};

export type RestorePreContractProjectInput = DomainContractEnvelopeInput & {
  negotiationId: string;
  offerId?: string;
  actorUserId: string;
  reason: RestoreReason;
};

export type RestorePreContractProjectResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  negotiationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: "NONE";
  reopened: boolean;
  notReopenedReason: NotReopenedReason | null;
  restoredFields: ["recruitmentStatus", "transactionStatus"];
};

const HTTP_BY_CODE: Record<DomainContractErrorCode, 404 | 409 | 422> = {
  PROJECT_NOT_FOUND: 404,
  PROJECT_TRANSITION_CONFLICT: 409,
  PROJECT_VERSION_CONFLICT: 409,
  PROJECT_ALREADY_RESTORED: 409,
  VALIDATION_ERROR: 422,
};

/** 포트 4xx. 본문은 api-contract 에러 봉투와 같다. */
export class DomainContractError extends Error {
  readonly httpStatus: 404 | 409 | 422;
  readonly body: DomainContractErrorBody;

  constructor(
    code: DomainContractErrorCode,
    message: string,
    details: DomainContractErrorBody["error"]["details"] = null,
  ) {
    super(message);
    this.name = "DomainContractError";
    this.httpStatus = HTTP_BY_CODE[code];
    this.body = { error: { code, message, details } };
  }
}

export function isDomainContractError(err: unknown): err is DomainContractError {
  return err instanceof DomainContractError;
}
