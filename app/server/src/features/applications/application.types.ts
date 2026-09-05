/**
 * applications — 도메인 타입 정본 (app/ 반영)
 *
 * 원본: features/applications/prototype/server/application.types.ts (조준영, PR #52 + 이후
 * 커밋 5건). app/ 재해석에서 바뀐 것 한 가지 — 원본의 `ApplicationStore`는 프로젝트 컨텍스트
 * (`clientId`·`recruitmentStatus`·`transactionStatus`·`acceptedApplicationId`)까지 같은
 * 저장소 안에 동기 함수로 뒀다(단일 프로세스 Mock이라 가능했다). app/에서는 프로젝트 원본이
 * project-management에 있으므로, 그 부분만 `ProjectApplicationContextPort`(비동기 포트)로
 * 분리했다 — `ApplicationRepository`는 지원(`applications`) 자기 자신의 행만 갖는다.
 */

export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ApplicationRejectionType =
  | 'DIRECT'
  | 'AUTO_OTHER_ACCEPTED'
  | 'AUTO_RECRUITMENT_CLOSED'
  | 'AGREEMENT_DECLINED';
export type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
export type ProjectTransactionStatus =
  | 'NONE'
  | 'CONTRACT_PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';
export type ClosureReason = 'RECRUITMENT_CLOSED' | 'PROJECT_CANCELED';
export type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';

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
  transactionStatus: 'CONTRACT_PENDING';
};

export type AcceptApplicationResponse = {
  applicationId: string;
  projectId: string;
  status: 'ACCEPTED';
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  applicationId: string;
  status: 'REJECTED';
  rejectionType: 'DIRECT';
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

/** project-management가 정본인 프로젝트 조각. `ProjectApplicationContextPort`가 채워준다. */
export type ProjectApplicationContext = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
};

export type ApplicationApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROJECT_FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_ALREADY_EXISTS'
  | 'PROJECT_TRANSITION_CONFLICT'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED';

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
    details: ApplicationApiErrorBody['error']['details'] = null,
  ) {
    super(message);
    this.name = 'ApplicationApiError';
    this.httpStatus = HTTP_BY_CODE[code];
    this.body = { error: { code, message, details } };
  }
}

export function isApplicationApiError(err: unknown): err is ApplicationApiError {
  return err instanceof ApplicationApiError;
}

export type ApplicationNotificationEvent = {
  type:
    | 'APPLICATION_SUBMITTED'
    | 'APPLICATION_ACCEPTED'
    | 'APPLICATION_REJECTED'
    | 'APPLICATION_AUTO_REJECTED';
  projectId: string;
  applicationId: string;
  occurredAt: string;
};

export type ApplicationNotificationPort = {
  publish(event: ApplicationNotificationEvent): Promise<void>;
};

/** applications 자기 자신의 지원 행 저장소. 프로젝트 조각은 없다 (위 주석 참고). */
export type ApplicationRepository = {
  getApplication(applicationId: string): ApplicationRow | undefined;
  getByProject(projectId: string): ApplicationRow[];
  getByFreelancer(freelancerId: string): ApplicationRow[];
  findByProjectFreelancer(projectId: string, freelancerId: string): ApplicationRow | undefined;
  insertApplication(row: ApplicationRow): void;
  saveApplication(row: ApplicationRow): void;
  getIdempotency(key: string): { bodyHash: string; applicationId: string } | undefined;
  setIdempotency(key: string, bodyHash: string, applicationId: string): void;
  getClosure(closureEventId: string): RejectPendingApplicationsResult | undefined;
  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): void;
  nextApplicationId(): string;
};

/** 프로젝트 컨텍스트 읽기 — project-management delegate (app/web/AGENTS.md "폴더 간 접점"). */
export type ProjectApplicationContextPort = {
  getProjectContext(projectId: string): Promise<ProjectApplicationContext | null>;
};

/** 지원 수락 — project-management delegate. 실 검증(권한·잠금·버전)은 그쪽 소유. */
export type AcceptProjectApplicationDelegateInput = {
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
  actorUserId: string;
  applicationId: string;
};

export type AcceptProjectApplicationDelegateResult = {
  projectId: string;
  acceptedApplicationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  alreadyProcessed: boolean;
};

export type AcceptProjectApplicationDelegate = {
  acceptProjectApplication(
    projectId: string,
    input: AcceptProjectApplicationDelegateInput,
  ): Promise<AcceptProjectApplicationDelegateResult>;
};
