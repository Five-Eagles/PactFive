import {
  ApplicationApiError,
  type AcceptApplicationResponse,
  type ApplicationNotificationPort,
  type ApplicationRow,
  type ApplicationStore,
  type CreateApplicationInput,
  type CreateApplicationResult,
  type ListMyApplicationsResponse,
  type ListProjectApplicationsResponse,
  type RejectApplicationResponse,
  type RejectPendingApplicationsInput,
  type RejectPendingApplicationsResult,
} from "./application.types";

export type ApplicationServiceDeps = {
  store: ApplicationStore;
  notifications: ApplicationNotificationPort;
  now: () => string;
};

function requireActor(actorUserId: string | undefined): string {
  if (!actorUserId) {
    throw new ApplicationApiError("AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  return actorUserId;
}

function requireProject(store: ApplicationStore, projectId: string) {
  const project = store.getProject(projectId);
  if (!project) {
    throw new ApplicationApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
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

function toItem(row: ApplicationRow, withProject: boolean): CreateApplicationResult["body"] {
  return {
    applicationId: row.applicationId,
    projectId: withProject ? row.projectId : row.projectId,
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
  event: Parameters<ApplicationNotificationPort["publish"]>[0],
): Promise<void> {
  // 발행 실패가 수락·거절을 되돌리지 않는다.
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
  const project = requireProject(deps.store, projectId);
  if (actor === project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  if (!input.coverLetter?.trim() || !Number.isInteger(input.expectedAmount) || input.expectedAmount <= 0) {
    throw new ApplicationApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
      { field: "expectedAmount", reason: "invalid" },
    ]);
  }
  if (!Number.isInteger(input.expectedDurationDays) || input.expectedDurationDays <= 0) {
    throw new ApplicationApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
      { field: "expectedDurationDays", reason: "invalid" },
    ]);
  }
  // 모집이 열린 뒤에만 INSERT한다.
  if (project.recruitmentStatus !== "OPEN") {
    throw new ApplicationApiError("PROJECT_TRANSITION_CONFLICT", "모집이 마감되었습니다.");
  }
  if (idempotencyKey) {
    const cached = deps.store.getIdempotency(idempotencyKey);
    if (cached) {
      if (cached.bodyHash !== bodyHash(input)) {
        throw new ApplicationApiError("APPLICATION_ALREADY_EXISTS", "이미 지원한 프로젝트입니다.");
      }
      const existing = deps.store.getApplication(cached.applicationId);
      if (existing) return { httpStatus: 200, body: toItem(existing, true) };
    }
  }
  const duplicate = deps.store.findByProjectFreelancer(projectId, actor);
  if (duplicate) {
    throw new ApplicationApiError("APPLICATION_ALREADY_EXISTS", "이미 지원한 프로젝트입니다.");
  }
  const nowIso = deps.now();
  const row: ApplicationRow = {
    applicationId: deps.store.nextApplicationId(),
    projectId,
    freelancerId: actor,
    coverLetter: input.coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
    status: "PENDING",
    rejectionType: null,
    decidedAt: null,
    createdAt: nowIso,
  };
  deps.store.insertApplication(row);
  deps.store.saveProject({
    ...project,
    applicationCount: project.applicationCount + 1,
    pendingApplicationCount: project.pendingApplicationCount + 1,
  });
  if (idempotencyKey) deps.store.setIdempotency(idempotencyKey, bodyHash(input), row.applicationId);
  await publish(deps, {
    type: "APPLICATION_SUBMITTED",
    projectId,
    applicationId: row.applicationId,
    occurredAt: nowIso,
  });
  return { httpStatus: 201, body: toItem(row, true) };
}

export async function listProjectApplications(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
): Promise<ListProjectApplicationsResponse> {
  const actor = requireActor(actorUserId);
  const project = requireProject(deps.store, projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  return {
    projectId,
    items: deps.store.getByProject(projectId).map((row) => toItem(row, true)),
  };
}

export async function listMyApplications(
  deps: ApplicationServiceDeps,
  actorUserId: string | undefined,
): Promise<ListMyApplicationsResponse> {
  const actor = requireActor(actorUserId);
  return {
    items: deps.store.getByFreelancer(actor).map((row) => ({
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
  const row = deps.store.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError("APPLICATION_NOT_FOUND", "지원을 찾을 수 없습니다.");
  }
  const project = requireProject(deps.store, row.projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  const acceptKey = idempotencyKey ?? `application-accept-${applicationId}`;
  const cached = deps.store.getIdempotency(acceptKey);
  if (cached?.applicationId === applicationId && project.acceptedApplicationId === applicationId) {
    return {
      applicationId,
      projectId: row.projectId,
      status: "ACCEPTED",
      handoff: {
        projectId: row.projectId,
        acceptedApplicationId: applicationId,
        transactionStatus: "CONTRACT_PENDING",
      },
    };
  }
  // 같은 지원인지 먼저 보고, 그다음 OPEN·NONE을 본다 (D-41).
  if (project.acceptedApplicationId === applicationId) {
    return {
      applicationId,
      projectId: row.projectId,
      status: "ACCEPTED",
      handoff: {
        projectId: row.projectId,
        acceptedApplicationId: applicationId,
        transactionStatus: "CONTRACT_PENDING",
      },
    };
  }
  if (project.acceptedApplicationId && project.acceptedApplicationId !== applicationId) {
    throw new ApplicationApiError(
      "PROJECT_TRANSITION_CONFLICT",
      "다른 지원자가 먼저 수락되었습니다",
    );
  }
  if (project.recruitmentStatus !== "OPEN" || project.transactionStatus !== "NONE") {
    throw new ApplicationApiError(
      "PROJECT_TRANSITION_CONFLICT",
      "다른 지원자가 먼저 수락되었습니다",
    );
  }
  const nowIso = deps.now();
  const accepted: ApplicationRow = {
    ...row,
    status: "ACCEPTED",
    rejectionType: null,
    decidedAt: nowIso,
  };
  deps.store.saveApplication(accepted);
  let pendingLeft = project.pendingApplicationCount - 1;
  for (const other of deps.store.getByProject(row.projectId)) {
    if (other.applicationId === applicationId || other.status !== "PENDING") continue;
    deps.store.saveApplication({
      ...other,
      status: "REJECTED",
      rejectionType: "AUTO_OTHER_ACCEPTED",
      decidedAt: nowIso,
    });
    pendingLeft -= 1;
    await publish(deps, {
      type: "APPLICATION_AUTO_REJECTED",
      projectId: row.projectId,
      applicationId: other.applicationId,
      occurredAt: nowIso,
    });
  }
  deps.store.saveProject({
    ...project,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: applicationId,
    pendingApplicationCount: Math.max(pendingLeft, 0),
  });
  deps.store.setIdempotency(acceptKey, applicationId, applicationId);
  await publish(deps, {
    type: "APPLICATION_ACCEPTED",
    projectId: row.projectId,
    applicationId,
    occurredAt: nowIso,
  });
  return {
    applicationId,
    projectId: row.projectId,
    status: "ACCEPTED",
    handoff: {
      projectId: row.projectId,
      acceptedApplicationId: applicationId,
      transactionStatus: "CONTRACT_PENDING",
    },
  };
}

export async function rejectApplication(
  deps: ApplicationServiceDeps,
  applicationId: string,
  actorUserId: string | undefined,
): Promise<RejectApplicationResponse> {
  const actor = requireActor(actorUserId);
  const row = deps.store.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError("APPLICATION_NOT_FOUND", "지원을 찾을 수 없습니다.");
  }
  const project = requireProject(deps.store, row.projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  if (row.status === "ACCEPTED") {
    throw new ApplicationApiError("PROJECT_TRANSITION_CONFLICT", "이미 수락된 지원입니다.");
  }
  if (row.status === "REJECTED") {
    return { applicationId, status: "REJECTED", rejectionType: "DIRECT" };
  }
  const nowIso = deps.now();
  deps.store.saveApplication({
    ...row,
    status: "REJECTED",
    rejectionType: "DIRECT",
    decidedAt: nowIso,
  });
  deps.store.saveProject({
    ...project,
    pendingApplicationCount: Math.max(project.pendingApplicationCount - 1, 0),
  });
  await publish(deps, {
    type: "APPLICATION_REJECTED",
    projectId: row.projectId,
    applicationId,
    occurredAt: nowIso,
  });
  return { applicationId, status: "REJECTED", rejectionType: "DIRECT" };
}

export async function rejectPendingApplications(
  deps: ApplicationServiceDeps,
  projectId: string,
  input: RejectPendingApplicationsInput,
): Promise<RejectPendingApplicationsResult> {
  if (!input.closureEventId || !input.reason || !input.occurredAt) {
    throw new ApplicationApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
      { field: "closureEventId", reason: "required" },
    ]);
  }
  const cached = deps.store.getClosure(input.closureEventId);
  if (cached) return { ...cached, alreadyProcessed: true };
  const project = requireProject(deps.store, projectId);
  const pending = deps.store.getByProject(projectId).filter((row) => row.status === "PENDING");
  if (pending.length === 0) {
    const none: RejectPendingApplicationsResult = {
      rejectedCount: 0,
      alreadyProcessed: false,
      result: "NOT_NEEDED",
    };
    deps.store.setClosure(input.closureEventId, none);
    return none;
  }
  const rejectionType = "AUTO_RECRUITMENT_CLOSED" as const;
  for (const row of pending) {
    deps.store.saveApplication({
      ...row,
      status: "REJECTED",
      rejectionType,
      decidedAt: input.occurredAt,
    });
    await publish(deps, {
      type: "APPLICATION_AUTO_REJECTED",
      projectId,
      applicationId: row.applicationId,
      occurredAt: input.occurredAt,
    });
  }
  deps.store.saveProject({
    ...project,
    pendingApplicationCount: 0,
  });
  const done: RejectPendingApplicationsResult = {
    rejectedCount: pending.length,
    alreadyProcessed: false,
    result: "DONE",
  };
  deps.store.setClosure(input.closureEventId, done);
  return done;
}
