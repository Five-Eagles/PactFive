import { createHash } from 'node:crypto';
import type { AcceptProjectApplicationDelegate } from './application.types';
import {
  ACCEPT_IDEMPOTENCY_PREFIX,
  COVER_LETTER_MAX,
  COVER_LETTER_MIN,
  EXPECTED_AMOUNT_MAX,
  EXPECTED_AMOUNT_MIN,
  EXPECTED_DURATION_MAX,
  EXPECTED_DURATION_MIN,
  LIST_PAGE_DEFAULT,
  LIST_PAGE_MAX,
  LIST_PAGE_SIZE_DEFAULT,
  LIST_PAGE_SIZE_MAX,
  MSG_COVER_LETTER,
  MSG_EXPECTED_AMOUNT,
  MSG_EXPECTED_DURATION,
  MSG_UNKNOWN_FIELD,
} from './application.constants';
import {
  ApplicationApiError,
  type AcceptApplicationResponse,
  type ApplicationDetail,
  type ApplicationNotificationPort,
  type ApplicationOperation,
  type ApplicationRepository,
  type ApplicationRow,
  type ApplicationStatus,
  type CreateApplicationBody,
  type CreateApplicationInput,
  type CreateApplicationResult,
  type EligibilityBlockedReason,
  type EligibilityResponse,
  type ListMyApplicationsResponse,
  type ListProjectApplicationsResponse,
  type ListQuery,
  type ProjectApplicationContext,
  type ProjectApplicationContextPort,
  type ProjectNotice,
  type RejectApplicationResponse,
} from './application.types';

/**
 * 원본: features/applications/prototype/server/application.service.ts (조준영, PR #83 —
 * 2026-09-07 develop 6202e16). 재해석한 부분:
 *
 * 1. 원본은 `deps.store.getProject(projectId)`가 동기 함수였다(Mock 저장소가 프로젝트
 *    조각까지 들고 있었다). app/에서는 프로젝트가 project-management 소유라 비동기
 *    delegate(`ProjectApplicationContextPort`)로 읽는다.
 * 2. 원본 `AcceptProjectApplicationPort`는 `(projectId, applicationId)` 2개 인자만 받는
 *    스탠드인이었다("유동우 C-01 스탠드인. 실 HTTP는 Increment 밖이다" — 원본 port 주석).
 *    app/은 이미 project-management의 실제 `acceptProjectApplication`을 호출하는 더 완전한
 *    `AcceptProjectApplicationDelegate`(requestId·idempotencyKey·occurredAt·actorUserId까지
 *    전달, accept-project-application.adapter.ts)를 갖고 있어 그대로 쓴다 — outbox 이후
 *    단계(잔여 거절·알림·손잡이 확인)만 원본 로직을 옮긴다.
 * 3. 프로필 완성도 검사(`requireProfile`/`PROFILE_INCOMPLETE`)는 뺐다 — user-management의
 *    완료도 포트가 아직 통합되지 않았기 때문이다. 지원 건수 쓰기는 PR #106에서
 *    `ProjectApplicationContextPort.bumpApplicationCounts`가 열렸으므로 app/ 통합 경로에서
 *    호출한다.
 *
 * 그 외 검증 순서·오류 코드·멱등 판정·outbox 단계는 원본 그대로다.
 */

export type ApplicationServiceDeps = {
  repository: ApplicationRepository;
  projectContext: ProjectApplicationContextPort;
  notifications: ApplicationNotificationPort;
  projectApplications: AcceptProjectApplicationDelegate;
  now: () => string;
  nextRequestId: () => string;
};

function requireActor(actorUserId: string | undefined): string {
  if (!actorUserId) {
    throw new ApplicationApiError('AUTH_REQUIRED', '로그인이 필요합니다.');
  }
  return actorUserId;
}

async function requireProject(
  deps: ApplicationServiceDeps,
  projectId: string,
): Promise<ProjectApplicationContext> {
  const project = await deps.projectContext.getProjectContext(projectId);
  if (!project) {
    throw new ApplicationApiError('PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }
  return project;
}

function toProjectNotice(project: ProjectApplicationContext | null): ProjectNotice {
  if (!project) return 'DELETED';
  if (project.transactionStatus === 'CANCELED') return 'CANCELED';
  return 'NONE';
}

function clampPage(page: number | undefined, size: number | undefined): { page: number; pageSize: number } {
  const rawPage = page ?? LIST_PAGE_DEFAULT;
  const rawSize = size ?? LIST_PAGE_SIZE_DEFAULT;
  const safePage = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, LIST_PAGE_MAX) : LIST_PAGE_DEFAULT;
  const safeSize =
    Number.isInteger(rawSize) && rawSize >= 1 ? Math.min(rawSize, LIST_PAGE_SIZE_MAX) : LIST_PAGE_SIZE_DEFAULT;
  return { page: safePage, pageSize: safeSize };
}

function paginate<T>(
  rows: T[],
  query: ListQuery | undefined,
): { slice: T[]; page: number; pageSize: number; totalCount: number; totalPages: number } {
  const { page, pageSize } = clampPage(query?.page, query?.pageSize);
  const totalCount = rows.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  return { slice: rows.slice(start, start + pageSize), page, pageSize, totalCount, totalPages };
}

function sortNewest(rows: ApplicationRow[]): ApplicationRow[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.applicationId < b.applicationId ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

const CREATE_ALLOWED_KEYS = new Set(['coverLetter', 'expectedAmount', 'expectedDurationDays']);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizeCoverLetter(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
}

function assertCreateAllowlist(input: CreateApplicationBody): void {
  const unknownKeys = Object.keys(input).filter((key) => !CREATE_ALLOWED_KEYS.has(key));
  if (unknownKeys.length === 0) return;
  throw new ApplicationApiError(
    'VALIDATION_ERROR',
    MSG_UNKNOWN_FIELD,
    unknownKeys.map((field) => ({ field, reason: 'unknown' })),
  );
}

function parseCreateInput(input: CreateApplicationBody): CreateApplicationInput {
  if (typeof input.coverLetter !== 'string') {
    throw new ApplicationApiError('VALIDATION_ERROR', MSG_COVER_LETTER, [
      { field: 'coverLetter', reason: 'invalid' },
    ]);
  }
  const coverLetter = normalizeCoverLetter(input.coverLetter);
  const coverLen = codePointLength(coverLetter);
  if (coverLen < COVER_LETTER_MIN || coverLen > COVER_LETTER_MAX) {
    throw new ApplicationApiError('VALIDATION_ERROR', MSG_COVER_LETTER, [
      { field: 'coverLetter', reason: 'invalid' },
    ]);
  }
  if (
    !Number.isInteger(input.expectedAmount) ||
    input.expectedAmount < EXPECTED_AMOUNT_MIN ||
    input.expectedAmount > EXPECTED_AMOUNT_MAX
  ) {
    throw new ApplicationApiError('VALIDATION_ERROR', MSG_EXPECTED_AMOUNT, [
      { field: 'expectedAmount', reason: 'invalid' },
    ]);
  }
  if (
    !Number.isInteger(input.expectedDurationDays) ||
    input.expectedDurationDays < EXPECTED_DURATION_MIN ||
    input.expectedDurationDays > EXPECTED_DURATION_MAX
  ) {
    throw new ApplicationApiError('VALIDATION_ERROR', MSG_EXPECTED_DURATION, [
      { field: 'expectedDurationDays', reason: 'invalid' },
    ]);
  }
  return {
    coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
  };
}

/**
 * 2026-09-10 수정 — 원래 이 함수가 JSON.stringify 결과를 그대로 돌려주고 있었다. 이름은
 * "hash"인데 실제로는 해시가 아니었던 것 — 결과물이 Prisma의 ApplicationIdempotencyKey.bodyHash
 * 컬럼(schema.prisma, @db.VarChar(64))에 그대로 들어가는데, coverLetter 최소 길이만 100자라
 * (application.constants.ts COVER_LETTER_MIN) JSON 문자열은 사실상 항상 64자를 넘는다.
 * 실제로 로컬에서 지원 생성 요청에 Idempotency-Key를 실어 보내자 Postgres가
 * "value too long for type character varying(64)"(22001)로 거부했고, 이 예외가 컨트롤러
 * 밖으로 새 나가 서버 프로세스 전체가 죽었다(아래 toHttp() 주석 참고). 지금은 SHA-256
 * hex digest(정확히 64자)를 저장한다 — 멱등 비교 목적에는 원문 대신 해시로 충분하다.
 */
function bodyHash(input: CreateApplicationInput): string {
  const raw = JSON.stringify({
    coverLetter: input.coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
  });
  return createHash('sha256').update(raw).digest('hex');
}

function toItem(row: ApplicationRow): CreateApplicationResult['body'] {
  return {
    applicationId: row.applicationId,
    projectId: row.projectId,
    freelancerId: row.freelancerId,
    coverLetter: row.coverLetter,
    expectedAmount: row.expectedAmount,
    expectedDurationDays: row.expectedDurationDays,
    status: row.status,
    rejectionType: row.rejectionType,
    createdAt: row.createdAt,
  };
}

function toDetail(row: ApplicationRow, project: ProjectApplicationContext | null): ApplicationDetail {
  return {
    ...toItem(row),
    decidedAt: row.decidedAt,
    projectNotice: toProjectNotice(project),
    transactionStatus: project?.transactionStatus ?? null,
  };
}

async function recordTransition(
  repository: ApplicationRepository,
  row: ApplicationRow,
  fromStatus: ApplicationStatus | null,
  at: string,
): Promise<void> {
  await repository.appendStateEvent({
    applicationId: row.applicationId,
    fromStatus,
    toStatus: row.status,
    rejectionType: row.rejectionType,
    at,
  });
}

async function publish(
  deps: ApplicationServiceDeps,
  event: Parameters<ApplicationNotificationPort['publish']>[0],
): Promise<void> {
  // 발행 실패가 수락·거절을 되돌리지 않는다 (원본과 같은 원칙).
  try {
    await deps.notifications.publish(event);
  } catch {
    return;
  }
}

function acceptHandoff(projectId: string, applicationId: string): AcceptApplicationResponse['handoff'] {
  return { projectId, acceptedApplicationId: applicationId, transactionStatus: 'CONTRACT_PENDING' };
}

function toAcceptBody(
  httpStatus: 200 | 202,
  applicationId: string,
  projectId: string,
  decidedAt: string,
  operation: ApplicationOperation,
  replayed: boolean,
): AcceptApplicationResponse {
  return {
    httpStatus,
    applicationId,
    projectId,
    status: 'ACCEPTED',
    decision: 'ACCEPTED',
    decidedAt,
    operationId: operation.operationId,
    postActionsStatus: operation.status,
    replayed,
    handoff: acceptHandoff(projectId, applicationId),
  };
}

/** app/은 항상 즉시 드레인한다 — `holdOutbox` 같은 보류 스위치는 두지 않았다(Mock 전용 테스트 훅). */
async function drainIfReady(deps: ApplicationServiceDeps): Promise<void> {
  await processOutbox(deps);
}

export async function processOutbox(deps: ApplicationServiceDeps): Promise<void> {
  for (const queued of await deps.repository.listQueuedOperations()) {
    await runOperation(deps, queued);
  }
}

function leaseUntilIso(nowIso: string): string {
  return new Date(Date.parse(nowIso) + 30_000).toISOString();
}

function queuedSteps(type: ApplicationOperation['type']): ApplicationOperation['steps'] {
  if (type === 'ACCEPT') {
    return [
      { name: 'REJECT_OTHERS', status: 'QUEUED', reason: null },
      { name: 'CREATE_NOTIFICATIONS', status: 'QUEUED', reason: null },
      { name: 'ENSURE_NEGOTIATION_CONTEXT', status: 'QUEUED', reason: null },
    ];
  }
  return [{ name: 'CREATE_NOTIFICATIONS', status: 'QUEUED', reason: null }];
}

async function runOperation(deps: ApplicationServiceDeps, operation: ApplicationOperation): Promise<void> {
  const nowIso = deps.now();
  const running: ApplicationOperation = {
    ...operation,
    status: 'RUNNING',
    updatedAt: nowIso,
    attempts: operation.attempts + 1,
    leaseUntil: leaseUntilIso(nowIso),
  };
  await deps.repository.saveOperation(running);
  const row = await deps.repository.getApplication(operation.applicationId);
  const project = await deps.projectContext.getProjectContext(operation.projectId);
  if (!row) {
    await deps.repository.saveOperation({
      ...running,
      status: 'FAILED',
      leaseUntil: null,
      requiresOperatorAction: true,
    });
    return;
  }

  const steps = running.steps.map((step) => ({ ...step }));
  if (operation.type === 'ACCEPT') {
    const rejectStep = steps.find((step) => step.name === 'REJECT_OTHERS');
    if (rejectStep) {
      const autoRejectedIds: string[] = [];
      for (const other of await deps.repository.getByProject(row.projectId)) {
        if (other.applicationId === row.applicationId || other.status !== 'PENDING') continue;
        const rejected: ApplicationRow = {
          ...other,
          status: 'REJECTED',
          rejectionType: 'AUTO_OTHER_ACCEPTED',
          decidedAt: nowIso,
        };
        await deps.repository.saveApplication(rejected);
        await recordTransition(deps.repository, rejected, 'PENDING', nowIso);
        autoRejectedIds.push(other.applicationId);
      }
      rejectStep.status = 'SUCCEEDED';
      const notifyStep = steps.find((step) => step.name === 'CREATE_NOTIFICATIONS');
      if (notifyStep) {
        for (const rejectedId of autoRejectedIds) {
          await publish(deps, {
            type: 'APPLICATION_AUTO_REJECTED',
            projectId: row.projectId,
            applicationId: rejectedId,
            occurredAt: nowIso,
          });
        }
        await publish(deps, {
          type: 'APPLICATION_ACCEPTED',
          projectId: row.projectId,
          applicationId: row.applicationId,
          occurredAt: nowIso,
        });
        notifyStep.status = 'SUCCEEDED';
      }
    }
    const handoffStep = steps.find((step) => step.name === 'ENSURE_NEGOTIATION_CONTEXT');
    if (handoffStep) {
      const ready =
        project?.acceptedApplicationId === row.applicationId && project.transactionStatus === 'CONTRACT_PENDING';
      handoffStep.status = ready ? 'SUCCEEDED' : 'FAILED';
      if (!ready) handoffStep.reason = 'HANDOFF_MISSING';
    }
  } else {
    const notifyStep = steps.find((step) => step.name === 'CREATE_NOTIFICATIONS');
    if (notifyStep) {
      await publish(deps, {
        type: 'APPLICATION_REJECTED',
        projectId: row.projectId,
        applicationId: row.applicationId,
        occurredAt: nowIso,
      });
      notifyStep.status = 'SUCCEEDED';
    }
  }

  const failed = steps.some((step) => step.status === 'FAILED');
  await deps.repository.saveOperation({
    ...running,
    steps,
    status: failed ? 'FAILED' : 'SUCCEEDED',
    updatedAt: deps.now(),
    leaseUntil: null,
    requiresOperatorAction: failed,
  });
}

/**
 * 지원 가능 여부 — `profileCompletion`은 항상 null, `blockedReasons`에 `PROFILE_INCOMPLETE`는
 * 절대 들어가지 않는다(application.types.ts 헤더 주석 2번 항목 — 프로필 포트 미존재).
 */
export async function getApplicationEligibility(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  actorRole?: 'CLIENT' | 'FREELANCER',
): Promise<EligibilityResponse> {
  const actor = requireActor(actorUserId);
  const project = await requireProject(deps, projectId);
  if (actorRole === 'CLIENT') {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '프리랜서만 지원할 수 있습니다.');
  }
  if (actor === project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  const blockedReasons: EligibilityBlockedReason[] = [];
  const existing = await deps.repository.findByProjectFreelancer(projectId, actor);
  if (existing) blockedReasons.push('ALREADY_APPLIED');
  if (project.transactionStatus === 'CANCELED') blockedReasons.push('PROJECT_CANCELED');
  if (project.recruitmentStatus !== 'OPEN') blockedReasons.push('RECRUITMENT_NOT_OPEN');
  if (project.recruitmentDeadlineAt && project.recruitmentDeadlineAt <= deps.now()) {
    blockedReasons.push('DEADLINE_PASSED');
  }

  return {
    projectId,
    canApply: blockedReasons.length === 0,
    blockedReasons,
    existingApplicationId: existing?.applicationId ?? null,
    profileCompletion: null,
  };
}

export async function createApplication(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  input: CreateApplicationBody,
  idempotencyKey: string | undefined,
  actorRole?: 'CLIENT' | 'FREELANCER',
): Promise<CreateApplicationResult> {
  const actor = requireActor(actorUserId);
  if (actorRole === 'CLIENT') {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '프리랜서만 지원할 수 있습니다.');
  }
  // 허용 필드·범위부터 검사하고 모집 상태는 그 다음에 본다.
  assertCreateAllowlist(input);
  const parsed = parseCreateInput(input);
  const project = await requireProject(deps, projectId);
  if (actor === project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  // 모집이 열린 뒤에만 INSERT한다.
  if (project.recruitmentStatus !== 'OPEN') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '모집이 마감되었습니다.');
  }
  // A-04 — Idempotency-Key 필수, 사용자·프로젝트로 격리.
  if (!idempotencyKey) {
    throw new ApplicationApiError('VALIDATION_ERROR', 'Idempotency-Key가 필요합니다.', [
      { field: 'Idempotency-Key', reason: 'required' },
    ]);
  }
  const scopedKey = `${projectId}:${actor}:${idempotencyKey}`;
  const cached = await deps.repository.getIdempotency(scopedKey);
  if (cached) {
    if (cached.bodyHash !== bodyHash(parsed)) {
      throw new ApplicationApiError('APPLICATION_ALREADY_EXISTS', '이미 지원한 프로젝트입니다.');
    }
    const existing = await deps.repository.getApplication(cached.applicationId);
    if (existing) return { httpStatus: 200, body: toItem(existing) };
  }
  const duplicate = await deps.repository.findByProjectFreelancer(projectId, actor);
  if (duplicate) {
    throw new ApplicationApiError('APPLICATION_ALREADY_EXISTS', '이미 지원한 프로젝트입니다.');
  }
  const nowIso = deps.now();
  const row: ApplicationRow = {
    applicationId: await deps.repository.nextApplicationId(),
    projectId,
    freelancerId: actor,
    coverLetter: parsed.coverLetter,
    expectedAmount: parsed.expectedAmount,
    expectedDurationDays: parsed.expectedDurationDays,
    status: 'PENDING',
    rejectionType: null,
    decidedAt: null,
    createdAt: nowIso,
  };
  await deps.repository.insertApplication(row);
  await recordTransition(deps.repository, row, null, nowIso);
  // A-03 — CR-AP-001 포트로 누적·대기 카운트를 올린다. 실패를 삼키면 행만 남고 건수는 0이 된다(R-001).
  await deps.projectContext.bumpApplicationCounts(projectId, {
    applicationCount: 1,
    pendingApplicationCount: 1,
  });
  await deps.repository.setIdempotency(scopedKey, bodyHash(parsed), row.applicationId);
  await publish(deps, {
    type: 'APPLICATION_SUBMITTED',
    projectId,
    applicationId: row.applicationId,
    occurredAt: nowIso,
  });
  return { httpStatus: 201, body: toItem(row) };
}

export async function listProjectApplications(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  query?: ListQuery,
): Promise<ListProjectApplicationsResponse> {
  const actor = requireActor(actorUserId);
  const project = await requireProject(deps, projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  const filtered = sortNewest(await deps.repository.getByProject(projectId)).filter((row) =>
    query?.status ? row.status === query.status : true,
  );
  const page = paginate(filtered, query);
  return {
    projectId,
    items: page.slice.map((row) => toItem(row)),
    page: page.page,
    pageSize: page.pageSize,
    totalCount: page.totalCount,
    totalPages: page.totalPages,
  };
}

export async function listMyApplications(
  deps: ApplicationServiceDeps,
  actorUserId: string | undefined,
  query?: ListQuery,
): Promise<ListMyApplicationsResponse> {
  const actor = requireActor(actorUserId);
  const filtered = sortNewest(await deps.repository.getByFreelancer(actor)).filter((row) =>
    query?.status ? row.status === query.status : true,
  );
  const page = paginate(filtered, query);
  const items = await Promise.all(
    page.slice.map(async (row) => {
      const project = await deps.projectContext.getProjectContext(row.projectId);
      return {
        applicationId: row.applicationId,
        projectId: row.projectId,
        status: row.status,
        rejectionType: row.rejectionType,
        createdAt: row.createdAt,
        transactionStatus: project?.transactionStatus ?? null,
        projectNotice: toProjectNotice(project),
      };
    }),
  );
  return {
    items,
    page: page.page,
    pageSize: page.pageSize,
    totalCount: page.totalCount,
    totalPages: page.totalPages,
  };
}

export async function getApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
): Promise<ApplicationDetail> {
  const actor = requireActor(actorUserId);
  const row = await deps.repository.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError('APPLICATION_NOT_FOUND', '지원을 찾을 수 없습니다.');
  }
  const project = await deps.projectContext.getProjectContext(row.projectId);
  const isOwner = actor === row.freelancerId;
  const isClient = project?.clientId === actor;
  if (!isOwner && !isClient) {
    throw new ApplicationApiError('APPLICATION_NOT_FOUND', '지원을 찾을 수 없습니다.');
  }
  return toDetail(row, project);
}

export async function getApplicationOperation(
  deps: ApplicationServiceDeps,
  operationId: string,
  actorUserId: string | undefined,
): Promise<ApplicationOperation> {
  const actor = requireActor(actorUserId);
  const operation = await deps.repository.getOperation(operationId);
  if (!operation || operation.clientId !== actor) {
    throw new ApplicationApiError('OPERATION_NOT_FOUND', '후속 작업을 찾을 수 없습니다.');
  }
  return operation;
}

export async function acceptApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
  idempotencyKey: string | undefined,
): Promise<AcceptApplicationResponse> {
  const actor = requireActor(actorUserId);
  const row = await deps.repository.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError('APPLICATION_NOT_FOUND', '지원을 찾을 수 없습니다.');
  }
  const project = await requireProject(deps, row.projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  const acceptKey = idempotencyKey ?? `${ACCEPT_IDEMPOTENCY_PREFIX}${applicationId}`;

  // 같은 지원인지 먼저 보고, 그다음 OPEN·NONE을 본다 (D-41 — 원본과 같은 순서).
  const cached = await deps.repository.getIdempotency(acceptKey);
  const operations = await deps.repository.getOperations();
  const existingOp = operations.find((item) => item.applicationId === applicationId && item.type === 'ACCEPT');
  if (project.acceptedApplicationId === applicationId && (cached?.applicationId === applicationId || existingOp)) {
    const operation =
      (cached?.operationId ? await deps.repository.getOperation(cached.operationId) : undefined) ?? existingOp;
    if (operation) {
      return toAcceptBody(200, applicationId, row.projectId, row.decidedAt ?? deps.now(), operation, true);
    }
  }
  if (project.acceptedApplicationId && project.acceptedApplicationId !== applicationId) {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '다른 지원자가 먼저 수락되었습니다');
  }
  if (row.status !== 'PENDING') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '대기 중인 지원만 수락할 수 있습니다.');
  }
  if (project.recruitmentStatus !== 'OPEN' || project.transactionStatus !== 'NONE') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '다른 지원자가 먼저 수락되었습니다');
  }

  // ① C-01(project-management)이 성공한 뒤에만 후속을 큐에 넣는다.
  await deps.projectApplications.acceptProjectApplication(row.projectId, {
    requestId: deps.nextRequestId(),
    idempotencyKey: acceptKey,
    occurredAt: deps.now(),
    actorUserId: actor,
    applicationId,
  });

  const nowIso = deps.now();
  const accepted: ApplicationRow = { ...row, status: 'ACCEPTED', rejectionType: null, decidedAt: nowIso };
  await deps.repository.saveApplication(accepted);
  await recordTransition(deps.repository, accepted, 'PENDING', nowIso);

  const operation: ApplicationOperation = {
    operationId: await deps.repository.nextOperationId(),
    applicationId,
    projectId: row.projectId,
    clientId: actor,
    type: 'ACCEPT',
    status: 'QUEUED',
    steps: queuedSteps('ACCEPT'),
    updatedAt: nowIso,
    retryAfterSeconds: 5,
    requiresOperatorAction: false,
    leaseUntil: null,
    attempts: 0,
  };
  await deps.repository.saveOperation(operation);
  await deps.repository.setIdempotency(acceptKey, applicationId, applicationId, operation.operationId);

  // ③ 잔여 거절·알림·손잡이 확인은 outbox가 드레인하며 처리한다(processOutbox/runOperation).
  await drainIfReady(deps);
  const finalOp = (await deps.repository.getOperation(operation.operationId)) ?? operation;
  const httpStatus: 200 | 202 = finalOp.status === 'SUCCEEDED' ? 200 : 202;
  return toAcceptBody(httpStatus, applicationId, row.projectId, nowIso, finalOp, false);
}

export async function rejectApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
): Promise<RejectApplicationResponse> {
  const actor = requireActor(actorUserId);
  const row = await deps.repository.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError('APPLICATION_NOT_FOUND', '지원을 찾을 수 없습니다.');
  }
  const project = await requireProject(deps, row.projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  if (row.status === 'ACCEPTED') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '이미 수락된 지원입니다.');
  }
  if (row.status === 'REJECTED') {
    return {
      httpStatus: 200,
      applicationId,
      status: 'REJECTED',
      rejectionType: 'DIRECT',
      decision: 'REJECTED',
      decidedAt: row.decidedAt,
      operationId: null,
      postActionsStatus: 'SUCCEEDED',
      replayed: true,
    };
  }
  const nowIso = deps.now();
  const rejected: ApplicationRow = { ...row, status: 'REJECTED', rejectionType: 'DIRECT', decidedAt: nowIso };
  await deps.repository.saveApplication(rejected);
  await recordTransition(deps.repository, rejected, 'PENDING', nowIso);
  // A-03 — 개별 거절은 대기 건수만 -1 (CR-AP-001). 수락·일괄 거절은 PM이 0으로 맞춘다.
  await deps.projectContext.bumpApplicationCounts(row.projectId, { pendingApplicationCount: -1 });

  const operation: ApplicationOperation = {
    operationId: await deps.repository.nextOperationId(),
    applicationId,
    projectId: row.projectId,
    clientId: actor,
    type: 'REJECT',
    status: 'QUEUED',
    steps: queuedSteps('REJECT'),
    updatedAt: nowIso,
    retryAfterSeconds: 5,
    requiresOperatorAction: false,
    leaseUntil: null,
    attempts: 0,
  };
  await deps.repository.saveOperation(operation);
  await drainIfReady(deps);
  const finalOp = (await deps.repository.getOperation(operation.operationId)) ?? operation;
  const httpStatus: 200 | 202 = finalOp.status === 'SUCCEEDED' ? 200 : 202;
  return {
    httpStatus,
    applicationId,
    status: 'REJECTED',
    rejectionType: 'DIRECT',
    decision: 'REJECTED',
    decidedAt: nowIso,
    operationId: finalOp.operationId,
    postActionsStatus: finalOp.status,
    replayed: false,
  };
}
