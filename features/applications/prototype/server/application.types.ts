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
export type ClosureReason = "RECRUITMENT_CLOSED" | "PROJECT_CANCELED";
export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";

export type CreateApplicationInput = {
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
};

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

export type ListProjectApplicationsResponse = {
  projectId: string;
  items: ApplicationItem[];
};

export type ListMyApplicationsResponse = {
  items: ApplicationItem[];
};

export type AcceptedApplicationHandoff = {
  projectId: string;
  acceptedApplicationId: string;
  transactionStatus: "CONTRACT_PENDING";
};

export type AcceptApplicationResponse = {
  applicationId: string;
  projectId: string;
  status: "ACCEPTED";
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  applicationId: string;
  status: "REJECTED";
  rejectionType: "DIRECT";
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
};

export type ApplicationApiErrorCode =
  | "AUTH_REQUIRED"
  | "PROJECT_FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_ALREADY_EXISTS"
  | "PROJECT_TRANSITION_CONFLICT"
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED";

export type ApplicationApiErrorBody = {
  error: {
    code: ApplicationApiErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

const HTTP_BY_CODE: Record<ApplicationApiErrorCode, 401 | 403 | 404 | 405 | 409 | 422> = {
  AUTH_REQUIRED: 401,
  PROJECT_FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  APPLICATION_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  APPLICATION_ALREADY_EXISTS: 409,
  PROJECT_TRANSITION_CONFLICT: 409,
  VALIDATION_ERROR: 422,
};

/** 공개 지원 API 4xx. */
export class ApplicationApiError extends Error {
  readonly httpStatus: 401 | 403 | 404 | 405 | 409 | 422;
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

export type ApplicationStore = {
  getProject(projectId: string): ProjectApplicationContext | undefined;
  getApplication(applicationId: string): ApplicationRow | undefined;
  getByProject(projectId: string): ApplicationRow[];
  getByFreelancer(freelancerId: string): ApplicationRow[];
  findByProjectFreelancer(projectId: string, freelancerId: string): ApplicationRow | undefined;
  insertApplication(row: ApplicationRow): void;
  saveApplication(row: ApplicationRow): void;
  saveProject(row: ProjectApplicationContext): void;
  getIdempotency(key: string): { bodyHash: string; applicationId: string } | undefined;
  setIdempotency(key: string, bodyHash: string, applicationId: string): void;
  getClosure(closureEventId: string): RejectPendingApplicationsResult | undefined;
  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): void;
  nextApplicationId(): string;
};
