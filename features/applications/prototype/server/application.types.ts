import type { ProfileCompletion, ProfileCompletionPort } from "./profile-completion.port";

export type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type ApplicationRejectionType =
  | "DIRECT"
  | "AUTO_OTHER_ACCEPTED"
  | "AUTO_RECRUITMENT_CLOSED"
  | "AGREEMENT_DECLINED";
export type RecruitmentStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type ProjectTransactionStatus =
  | "NONE"
  | "CONTRACT_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";
export type ProjectNotice = "NONE" | "CANCELED" | "DELETED";
export type ClosureReason = "RECRUITMENT_CLOSED" | "PROJECT_CANCELED";
export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";
export type EligibilityBlockedReason =
  | "ALREADY_APPLIED"
  | "PROJECT_CANCELED"
  | "RECRUITMENT_NOT_OPEN"
  | "DEADLINE_PASSED"
  | "PROFILE_INCOMPLETE";
export type OperationType = "ACCEPT" | "REJECT";
export type OperationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type OperationStepStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
export type OperationStepName = "REJECT_OTHERS" | "CREATE_NOTIFICATIONS" | "ENSURE_NEGOTIATION_CONTEXT";

export type CreateApplicationInput = {
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
};

/** 생성 본문. 허용 외 키는 서비스가 거부한다. */
export type CreateApplicationBody = CreateApplicationInput & Record<string, unknown>;

export type ApplicationItem = {
  applicationId: string;
  projectId?: string;
  freelancerId?: string;
  coverLetter?: string;
  expectedAmount?: number;
  expectedDurationDays?: number;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  createdAt: string;
};

export type CreateApplicationResult = {
  httpStatus: 200 | 201;
  body: ApplicationItem & { projectId: string; freelancerId: string };
};

export type ListQuery = {
  page?: number;
  pageSize?: number;
  status?: ApplicationStatus;
};

export type ListPageMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type ListProjectApplicationsResponse = ListPageMeta & {
  projectId: string;
  items: ApplicationItem[];
};

export type MyApplicationItem = {
  applicationId: string;
  projectId: string;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  createdAt: string;
  transactionStatus: ProjectTransactionStatus | null;
  projectNotice: ProjectNotice;
};

export type ListMyApplicationsResponse = ListPageMeta & {
  items: MyApplicationItem[];
};

export type ApplicationDetail = ApplicationItem & {
  projectId: string;
  freelancerId: string;
  decidedAt: string | null;
  projectNotice: ProjectNotice;
  transactionStatus: ProjectTransactionStatus | null;
};

export type EligibilityResponse = {
  projectId: string;
  canApply: boolean;
  blockedReasons: EligibilityBlockedReason[];
  existingApplicationId: string | null;
  profileCompletion: ProfileCompletion | null;
};

export type OperationStep = {
  name: OperationStepName;
  status: OperationStepStatus;
  reason: string | null;
};

export type ApplicationOperation = {
  operationId: string;
  applicationId: string;
  projectId: string;
  clientId: string;
  type: OperationType;
  status: OperationStatus;
  steps: OperationStep[];
  updatedAt: string;
  retryAfterSeconds: number;
  requiresOperatorAction: boolean;
  leaseUntil: string | null;
  attempts: number;
};

export type ApplicationStateEvent = {
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  at: string;
};

export type AcceptedApplicationHandoff = {
  projectId: string;
  acceptedApplicationId: string;
  transactionStatus: "CONTRACT_PENDING";
};

export type AcceptApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  projectId: string;
  status: "ACCEPTED";
  decision: "ACCEPTED";
  decidedAt: string;
  operationId: string;
  postActionsStatus: OperationStatus;
  replayed: boolean;
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  status: "REJECTED";
  rejectionType: "DIRECT";
  decision: "REJECTED";
  decidedAt: string | null;
  operationId: string | null;
  postActionsStatus: OperationStatus | null;
  replayed: boolean;
};

export type RejectPendingApplicationsInput = {
  closureEventId: string;
  reason: ClosureReason;
  occurredAt: string;
};

export type RejectPendingApplicationsResult = {
  rejectedCount: number;
  alreadyProcessed: boolean;
  result: PostActionResult;
};

export type ApplicationRow = {
  applicationId: string;
  projectId: string;
  freelancerId: string;
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  decidedAt: string | null;
  createdAt: string;
};

export type ProjectApplicationContext = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
  applicationCount: number;
  pendingApplicationCount: number;
  recruitmentDeadlineAt?: string | null;
};

export type ApplicationApiErrorCode =
  | "AUTH_REQUIRED"
  | "PROJECT_FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_ALREADY_EXISTS"
  | "PROJECT_TRANSITION_CONFLICT"
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "PROFILE_INCOMPLETE"
  | "DEPENDENCY_UNAVAILABLE"
  | "OPERATION_NOT_FOUND";

export type ApplicationApiErrorBody = {
  error: {
    code: ApplicationApiErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

const HTTP_BY_CODE: Record<ApplicationApiErrorCode, 401 | 403 | 404 | 405 | 409 | 422 | 503> = {
  AUTH_REQUIRED: 401,
  PROJECT_FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  OPERATION_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  APPLICATION_ALREADY_EXISTS: 409,
  PROJECT_TRANSITION_CONFLICT: 409,
  PROFILE_INCOMPLETE: 409,
  VALIDATION_ERROR: 422,
  DEPENDENCY_UNAVAILABLE: 503,
};

/** 공개 지원 API 4xx·5xx. PROFILE_* 는 Mock 로컬이다. */
export class ApplicationApiError extends Error {
  readonly httpStatus: 401 | 403 | 404 | 405 | 409 | 422 | 503;
  readonly body: ApplicationApiErrorBody;

  constructor(
    code: ApplicationApiErrorCode,
    message: string,
    details: ApplicationApiErrorBody["error"]["details"] = null,
  ) {
    super(message);
    this.name = "ApplicationApiError";
    this.httpStatus = HTTP_BY_CODE[code];
    this.body = { error: { code, message, details } };
  }
}

export function isApplicationApiError(err: unknown): err is ApplicationApiError {
  return err instanceof ApplicationApiError;
}

export type ApplicationNotificationEvent = {
  type:
    | "APPLICATION_SUBMITTED"
    | "APPLICATION_ACCEPTED"
    | "APPLICATION_REJECTED"
    | "APPLICATION_AUTO_REJECTED";
  projectId: string;
  applicationId: string;
  occurredAt: string;
};

export type ApplicationNotificationPort = {
  publish(event: ApplicationNotificationEvent): Promise<void>;
};

export type IdempotencyRecord = {
  bodyHash: string;
  applicationId: string;
  operationId?: string;
};

export type ApplicationStore = {
  getProject(projectId: string): ProjectApplicationContext | undefined;
  getApplication(applicationId: string): ApplicationRow | undefined;
  getByProject(projectId: string): ApplicationRow[];
  getByFreelancer(freelancerId: string): ApplicationRow[];
  findByProjectFreelancer(projectId: string, freelancerId: string): ApplicationRow | undefined;
  insertApplication(row: ApplicationRow): void;
  saveApplication(row: ApplicationRow): void;
  saveProject(row: ProjectApplicationContext): void;
  getIdempotency(key: string): IdempotencyRecord | undefined;
  setIdempotency(key: string, bodyHash: string, applicationId: string, operationId?: string): void;
  getClosure(closureEventId: string): RejectPendingApplicationsResult | undefined;
  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): void;
  nextApplicationId(): string;
  nextOperationId(): string;
  saveOperation(row: ApplicationOperation): void;
  getOperation(operationId: string): ApplicationOperation | undefined;
  getOperations(): ApplicationOperation[];
  listQueuedOperations(): ApplicationOperation[];
  appendStateEvent(event: ApplicationStateEvent): void;
  getStateEvents(applicationId: string): ApplicationStateEvent[];
};

export type { ProfileCompletion, ProfileCompletionPort };
