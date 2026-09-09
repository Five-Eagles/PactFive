/**
 * applications — 도메인 타입 정본 (app/ 반영)
 *
 * 원본: features/applications/prototype/server/application.types.ts (조준영, PR #52 + 이후
 * 커밋 5건, 최신은 PR #83 — 2026-09-07 develop 6202e16). app/ 재해석에서 바뀐 것 한 가지 —
 * 원본의 `ApplicationStore`는 프로젝트 컨텍스트(`clientId`·`recruitmentStatus`·
 * `transactionStatus`·`acceptedApplicationId`)까지 같은 저장소 안에 동기 함수로 뒀다(단일
 * 프로세스 Mock이라 가능했다). app/에서는 프로젝트 원본이 project-management에 있으므로,
 * 그 부분만 `ProjectApplicationContextPort`(비동기 포트)로 분리했다 — `ApplicationRepository`는
 * 지원(`applications`) 자기 자신의 행·멱등·closure·operation·상태 이력만 갖는다.
 *
 * PR #83 이식 범위 — 2026-09-07 대화, RW 결정("카운트 제외하고 나머지만 먼저")에 따라
 * 두 가지를 이번 반영에서 뺐다:
 * 1. `applicationCount`/`pendingApplicationCount` 쓰기 — CR-AP-001(조준영→project-management
 *    유동우)이 아직 승인 대기 중이라, project-management 쪽에 그 카운트를 받아 쓸 포트가
 *    없다. `ProjectApplicationContext`에 두 필드를 추가하지 않는다 — 원본 스토어에는
 *    있지만 app/은 읽지도 쓰지도 않는다. CR-AP-001이 머지되면 이 타입과
 *    `project-application-context.adapter.ts`를 함께 갱신한다.
 * 2. 프로필 완성도 강제(`ProfileCompletionPort`/`PROFILE_INCOMPLETE`) — user-management에
 *    아직 프로필 관련 코드가 전혀 없다(인증만 있음). 원본 포트 자신의 주석이 "기본 COMPLETE
 *    우회 금지"라고 못박아 뒀으므로, 가짜 어댑터를 만들어 항상 COMPLETE를 반환하게 하는
 *    대신 — 이 축의 검사 자체를 생략한다(`getApplicationEligibility`의 `profileCompletion`은
 *    항상 `null`, `blockedReasons`에 `PROFILE_INCOMPLETE`를 절대 넣지 않는다;
 *    `createApplication`도 프로필을 확인하지 않는다). 응답 모양(`EligibilityResponse`)은
 *    계약 그대로 유지해 나중에 실제 포트가 붙어도 화면 쪽 타입은 안 바뀐다.
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
export type ProjectNotice = 'NONE' | 'CANCELED' | 'DELETED';
export type ClosureReason = 'RECRUITMENT_CLOSED' | 'PROJECT_CANCELED';
export type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';
export type EligibilityBlockedReason =
  | 'ALREADY_APPLIED'
  | 'PROJECT_CANCELED'
  | 'RECRUITMENT_NOT_OPEN'
  | 'DEADLINE_PASSED'
  | 'PROFILE_INCOMPLETE';
export type OperationType = 'ACCEPT' | 'REJECT';
export type OperationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type OperationStepStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type OperationStepName = 'REJECT_OTHERS' | 'CREATE_NOTIFICATIONS' | 'ENSURE_NEGOTIATION_CONTEXT';

export type CreateApplicationInput = {
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
};

/** 생성 본문 — 허용 외 키는 서비스가 거부한다(허용목록 검사, PR #83). */
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

/** 단건 조회(`GET /applications/:applicationId`, PR #83 신규) — 본인 또는 해당 의뢰인만. */
export type ApplicationDetail = ApplicationItem & {
  projectId: string;
  freelancerId: string;
  decidedAt: string | null;
  projectNotice: ProjectNotice;
  transactionStatus: ProjectTransactionStatus | null;
};

/**
 * 지원 가능 여부(`GET /projects/:projectId/application-eligibility`, PR #83 신규).
 * `profileCompletion`은 이번 반영에서 항상 null이고 `blockedReasons`에 `PROFILE_INCOMPLETE`는
 * 절대 들어가지 않는다 — 위 헤더 주석의 2번 항목(프로필 포트 미존재) 참고.
 */
export type EligibilityResponse = {
  projectId: string;
  canApply: boolean;
  blockedReasons: EligibilityBlockedReason[];
  existingApplicationId: string | null;
  profileCompletion: null;
};

export type OperationStep = {
  name: OperationStepName;
  status: OperationStepStatus;
  reason: string | null;
};

/**
 * 수락·거절 후속 처리(잔여 거절·알림 발행·손잡이 확인)의 outbox 기록(PR #83 신규).
 * `acceptApplication`/`rejectApplication`이 큐에 넣고, 같은 요청 안에서 동기로 드레인한다
 * (`holdOutbox`를 켜지 않는 한 — app/은 항상 즉시 드레인하므로 실제로는 거의 항상 SUCCEEDED로
 * 끝난 뒤 200을 돌려준다. 202는 드레인 중 실패했을 때만 나온다).
 */
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
  transactionStatus: 'CONTRACT_PENDING';
};

export type AcceptApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  projectId: string;
  status: 'ACCEPTED';
  decision: 'ACCEPTED';
  decidedAt: string;
  operationId: string;
  postActionsStatus: OperationStatus;
  replayed: boolean;
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  status: 'REJECTED';
  rejectionType: 'DIRECT';
  decision: 'REJECTED';
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

/**
 * project-management가 정본인 프로젝트 조각. `ProjectApplicationContextPort`가 채워준다.
 * `recruitmentDeadlineAt`은 `getProjectNegotiationContext`가 이미 반환하는 값을 그대로
 * 옮긴 것(project-contract.service.ts 109-124행 확인, PM 쪽 코드 변경 불필요) —
 * `getApplicationEligibility`의 `DEADLINE_PASSED` 판정에 쓴다.
 *
 * `applicationCount`/`pendingApplicationCount`는 의도적으로 넣지 않았다 — 파일 헤더 주석
 * 1번 항목(CR-AP-001 대기) 참고.
 */
export type ProjectApplicationContext = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string | null;
};

export type ApplicationApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROJECT_FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'APPLICATION_NOT_FOUND'
  | 'APPLICATION_ALREADY_EXISTS'
  | 'PROJECT_TRANSITION_CONFLICT'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED'
  | 'OPERATION_NOT_FOUND';

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
  OPERATION_NOT_FOUND: 404,
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

export type IdempotencyRecord = {
  bodyHash: string;
  applicationId: string;
  operationId?: string;
};

/**
 * applications 자기 자신의 지원 행 저장소. 프로젝트 조각은 없다 (위 주석 참고).
 * PR #83 이식으로 operation(outbox 기록)·상태 이력을 추가했다 — 둘 다 applications 자신의
 * 데이터라 프로젝트 컨텍스트 분리 원칙과 무관하게 그대로 옮긴다.
 */
/**
 * 2026-09-08 팀장 반영: Prisma 백엔드 추가를 위해 전 메서드를 Promise 반환으로 바꿨다 —
 * InMemory 구현은 계산한 값을 Promise.resolve로 감싸기만 하면 되고, application.service.ts
 * 호출부는 전부 이미 async 함수 안이라 await만 추가하면 된다.
 */
export type ApplicationRepository = {
  getApplication(applicationId: string): Promise<ApplicationRow | undefined>;
  getByProject(projectId: string): Promise<ApplicationRow[]>;
  getByFreelancer(freelancerId: string): Promise<ApplicationRow[]>;
  findByProjectFreelancer(projectId: string, freelancerId: string): Promise<ApplicationRow | undefined>;
  insertApplication(row: ApplicationRow): Promise<void>;
  saveApplication(row: ApplicationRow): Promise<void>;
  getIdempotency(key: string): Promise<IdempotencyRecord | undefined>;
  setIdempotency(key: string, bodyHash: string, applicationId: string, operationId?: string): Promise<void>;
  getClosure(closureEventId: string): Promise<RejectPendingApplicationsResult | undefined>;
  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): Promise<void>;
  nextApplicationId(): Promise<string>;
  nextOperationId(): Promise<string>;
  saveOperation(row: ApplicationOperation): Promise<void>;
  getOperation(operationId: string): Promise<ApplicationOperation | undefined>;
  getOperations(): Promise<ApplicationOperation[]>;
  listQueuedOperations(): Promise<ApplicationOperation[]>;
  appendStateEvent(event: ApplicationStateEvent): Promise<void>;
  getStateEvents(applicationId: string): Promise<ApplicationStateEvent[]>;
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
