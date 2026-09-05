import type { AcceptProjectApplicationDelegate } from './application.types';
import {
  ApplicationApiError,
  type AcceptApplicationResponse,
  type ApplicationNotificationPort,
  type ApplicationRepository,
  type ApplicationRow,
  type CreateApplicationInput,
  type CreateApplicationResult,
  type ListMyApplicationsResponse,
  type ListProjectApplicationsResponse,
  type ProjectApplicationContext,
  type ProjectApplicationContextPort,
  type RejectApplicationResponse,
} from './application.types';

/**
 * 원본: features/applications/prototype/server/application.service.ts (조준영).
 *
 * 재해석한 부분 — 원본은 `deps.store.getProject(projectId)`가 동기 함수였다(Mock 저장소가
 * 프로젝트 조각까지 들고 있었다). app/에서는 프로젝트가 project-management 소유라 비동기
 * delegate(`ProjectApplicationContextPort`)로 읽는다. 그 외 검증 순서·오류 코드·멱등 판정은
 * 원본 그대로다(테스트 35건이 이미 이 순서를 검증했다).
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

function bodyHash(input: CreateApplicationInput): string {
  return JSON.stringify({
    coverLetter: input.coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
  });
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

export async function createApplication(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  input: CreateApplicationInput,
  idempotencyKey: string | undefined,
): Promise<CreateApplicationResult> {
  const actor = requireActor(actorUserId);
  const project = await requireProject(deps, projectId);
  if (actor === project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  if (
    !input.coverLetter?.trim() ||
    !Number.isInteger(input.expectedAmount) ||
    input.expectedAmount <= 0
  ) {
    throw new ApplicationApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'expectedAmount', reason: 'invalid' },
    ]);
  }
  if (!Number.isInteger(input.expectedDurationDays) || input.expectedDurationDays <= 0) {
    throw new ApplicationApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'expectedDurationDays', reason: 'invalid' },
    ]);
  }
  // 모집이 열린 뒤에만 INSERT한다.
  if (project.recruitmentStatus !== 'OPEN') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '모집이 마감되었습니다.');
  }
  if (idempotencyKey) {
    const cached = deps.repository.getIdempotency(idempotencyKey);
    if (cached) {
      if (cached.bodyHash !== bodyHash(input)) {
        throw new ApplicationApiError('APPLICATION_ALREADY_EXISTS', '이미 지원한 프로젝트입니다.');
      }
      const existing = deps.repository.getApplication(cached.applicationId);
      if (existing) return { httpStatus: 200, body: toItem(existing) };
    }
  }
  const duplicate = deps.repository.findByProjectFreelancer(projectId, actor);
  if (duplicate) {
    throw new ApplicationApiError('APPLICATION_ALREADY_EXISTS', '이미 지원한 프로젝트입니다.');
  }
  const nowIso = deps.now();
  const row: ApplicationRow = {
    applicationId: deps.repository.nextApplicationId(),
    projectId,
    freelancerId: actor,
    coverLetter: input.coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
    status: 'PENDING',
    rejectionType: null,
    decidedAt: null,
    createdAt: nowIso,
  };
  deps.repository.insertApplication(row);
  if (idempotencyKey) deps.repository.setIdempotency(idempotencyKey, bodyHash(input), row.applicationId);
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
): Promise<ListProjectApplicationsResponse> {
  const actor = requireActor(actorUserId);
  const project = await requireProject(deps, projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  return {
    projectId,
    items: deps.repository.getByProject(projectId).map((row) => toItem(row)),
  };
}

export async function listMyApplications(
  deps: ApplicationServiceDeps,
  actorUserId: string | undefined,
): Promise<ListMyApplicationsResponse> {
  const actor = requireActor(actorUserId);
  return {
    items: deps.repository.getByFreelancer(actor).map((row) => ({
      applicationId: row.applicationId,
      projectId: row.projectId,
      status: row.status,
      rejectionType: row.rejectionType,
      createdAt: row.createdAt,
    })),
  };
}

export async function acceptApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
  idempotencyKey: string | undefined,
): Promise<AcceptApplicationResponse> {
  const actor = requireActor(actorUserId);
  const row = deps.repository.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError('APPLICATION_NOT_FOUND', '지원을 찾을 수 없습니다.');
  }
  const project = await requireProject(deps, row.projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  const acceptKey = idempotencyKey ?? `application-accept-${applicationId}`;

  // 같은 지원인지 먼저 보고, 그다음 OPEN·NONE을 본다 (D-41 — 원본과 같은 순서).
  if (project.acceptedApplicationId === applicationId) {
    return {
      applicationId,
      projectId: row.projectId,
      status: 'ACCEPTED',
      handoff: {
        projectId: row.projectId,
        acceptedApplicationId: applicationId,
        transactionStatus: 'CONTRACT_PENDING',
      },
    };
  }
  if (project.acceptedApplicationId && project.acceptedApplicationId !== applicationId) {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '다른 지원자가 먼저 수락되었습니다');
  }
  if (project.recruitmentStatus !== 'OPEN' || project.transactionStatus !== 'NONE') {
    throw new ApplicationApiError('PROJECT_TRANSITION_CONFLICT', '다른 지원자가 먼저 수락되었습니다');
  }

  // ① C-01(project-management)이 성공한 뒤에만 잔여를 거절한다.
  await deps.projectApplications.acceptProjectApplication(row.projectId, {
    requestId: deps.nextRequestId(),
    idempotencyKey: acceptKey,
    occurredAt: deps.now(),
    actorUserId: actor,
    applicationId,
  });

  const nowIso = deps.now();
  deps.repository.saveApplication({ ...row, status: 'ACCEPTED', rejectionType: null, decidedAt: nowIso });

  const autoRejectedIds: string[] = [];
  for (const other of deps.repository.getByProject(row.projectId)) {
    if (other.applicationId === applicationId || other.status !== 'PENDING') continue;
    deps.repository.saveApplication({
      ...other,
      status: 'REJECTED',
      rejectionType: 'AUTO_OTHER_ACCEPTED',
      decidedAt: nowIso,
    });
    autoRejectedIds.push(other.applicationId);
  }

  // ③ 잔여 거절이 끝난 뒤에만 알림을 발행한다.
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
    applicationId,
    occurredAt: nowIso,
  });

  return {
    applicationId,
    projectId: row.projectId,
    status: 'ACCEPTED',
    handoff: {
      projectId: row.projectId,
      acceptedApplicationId: applicationId,
      transactionStatus: 'CONTRACT_PENDING',
    },
  };
}

export async function rejectApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
): Promise<RejectApplicationResponse> {
  const actor = requireActor(actorUserId);
  const row = deps.repository.getApplication(applicationId);
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
    return { applicationId, status: 'REJECTED', rejectionType: 'DIRECT' };
  }
  const nowIso = deps.now();
  deps.repository.saveApplication({ ...row, status: 'REJECTED', rejectionType: 'DIRECT', decidedAt: nowIso });
  await publish(deps, {
    type: 'APPLICATION_REJECTED',
    projectId: row.projectId,
    applicationId,
    occurredAt: nowIso,
  });
  return { applicationId, status: 'REJECTED', rejectionType: 'DIRECT' };
}
