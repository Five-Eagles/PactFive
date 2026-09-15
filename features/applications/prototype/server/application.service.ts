import type { AcceptProjectApplicationPort } from "./accept-project-application.port";
import {
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
  MSG_PROFILE_INCOMPLETE,
  MSG_UNKNOWN_FIELD,
} from "./application.constants";
import {
  ApplicationApiError,
  type AcceptApplicationResponse,
  type ApplicationDetail,
  type ApplicationNotificationPort,
  type ApplicationOperation,
  type ApplicationRow,
  type ApplicationStatus,
  type ApplicationStore,
  type CreateApplicationBody,
  type CreateApplicationInput,
  type CreateApplicationResult,
  type EligibilityBlockedReason,
  type EligibilityResponse,
  type ListMyApplicationsResponse,
  type ListProjectApplicationsResponse,
  type ListQuery,
  type ProjectApplicationContext,
  type ProjectNotice,
  type RejectApplicationResponse,
  type RejectPendingApplicationsInput,
  type RejectPendingApplicationsResult,
} from "./application.types";
import type { ProfileCompletionPort } from "./profile-completion.port";

export type ApplicationServiceDeps = {
  store: ApplicationStore;
  notifications: ApplicationNotificationPort;
  projectApplications: AcceptProjectApplicationPort;
  profiles?: ProfileCompletionPort;
  now: () => string;
  holdOutbox?: boolean;
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

function toProjectNotice(project: ProjectApplicationContext | undefined): ProjectNotice {
  if (!project) return "DELETED";
  if (project.transactionStatus === "CANCELED") return "CANCELED";
  return "NONE";
}

function clampPage(page: number | undefined, size: number | undefined): { page: number; pageSize: number } {
  const rawPage = page ?? LIST_PAGE_DEFAULT;
  const rawSize = size ?? LIST_PAGE_SIZE_DEFAULT;
  const safePage = Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(rawPage, LIST_PAGE_MAX) : LIST_PAGE_DEFAULT;
  const safeSize =
    Number.isInteger(rawSize) && rawSize >= 1 ? Math.min(rawSize, LIST_PAGE_SIZE_MAX) : LIST_PAGE_SIZE_DEFAULT;
  return { page: safePage, pageSize: safeSize };
}

function paginate<T>(rows: T[], query: ListQuery | undefined): { slice: T[]; page: number; pageSize: number; totalCount: number; totalPages: number } {
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

const CREATE_ALLOWED_KEYS = new Set(["coverLetter", "expectedAmount", "expectedDurationDays"]);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function normalizeCoverLetter(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

function assertCreateAllowlist(input: CreateApplicationBody): void {
  const unknownKeys = Object.keys(input).filter((key) => !CREATE_ALLOWED_KEYS.has(key));
  if (unknownKeys.length === 0) return;
  throw new ApplicationApiError(
    "VALIDATION_ERROR",
    MSG_UNKNOWN_FIELD,
    unknownKeys.map((field) => ({ field, reason: "unknown" })),
  );
}

function parseCreateInput(input: CreateApplicationBody): CreateApplicationInput {
  if (typeof input.coverLetter !== "string") {
    throw new ApplicationApiError("VALIDATION_ERROR", MSG_COVER_LETTER, [
      { field: "coverLetter", reason: "invalid" },
    ]);
  }
  const coverLetter = normalizeCoverLetter(input.coverLetter);
  const coverLen = codePointLength(coverLetter);
  if (coverLen < COVER_LETTER_MIN || coverLen > COVER_LETTER_MAX) {
    throw new ApplicationApiError("VALIDATION_ERROR", MSG_COVER_LETTER, [
      { field: "coverLetter", reason: "invalid" },
    ]);
  }
  if (!Number.isInteger(input.expectedAmount) || input.expectedAmount < EXPECTED_AMOUNT_MIN || input.expectedAmount > EXPECTED_AMOUNT_MAX) {
    throw new ApplicationApiError("VALIDATION_ERROR", MSG_EXPECTED_AMOUNT, [
      { field: "expectedAmount", reason: "invalid" },
    ]);
  }
  if (
    !Number.isInteger(input.expectedDurationDays) ||
    input.expectedDurationDays < EXPECTED_DURATION_MIN ||
    input.expectedDurationDays > EXPECTED_DURATION_MAX
  ) {
    throw new ApplicationApiError("VALIDATION_ERROR", MSG_EXPECTED_DURATION, [
      { field: "expectedDurationDays", reason: "invalid" },
    ]);
  }
  return {
    coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
  };
}

function bodyHash(input: CreateApplicationInput): string {
  return JSON.stringify({
    coverLetter: input.coverLetter,
    expectedAmount: input.expectedAmount,
    expectedDurationDays: input.expectedDurationDays,
  });
}

function toItem(row: ApplicationRow): CreateApplicationResult["body"] {
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

function toDetail(row: ApplicationRow, project: ProjectApplicationContext | undefined): ApplicationDetail {
  return {
    ...toItem(row),
    decidedAt: row.decidedAt,
    projectNotice: toProjectNotice(project),
    transactionStatus: project?.transactionStatus ?? null,
  };
}

function recordTransition(
  store: ApplicationStore,
  row: ApplicationRow,
  fromStatus: ApplicationStatus | null,
  at: string,
): void {
  store.appendStateEvent({
    applicationId: row.applicationId,
    fromStatus,
    toStatus: row.status,
    rejectionType: row.rejectionType,
    at,
  });
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

async function requireProfile(deps: ApplicationServiceDeps, userId: string) {
  if (!deps.profiles) {
    throw new ApplicationApiError("DEPENDENCY_UNAVAILABLE", "프로필 상태를 확인할 수 없습니다.");
  }
  const completion = await deps.profiles.getProfileCompletion(userId);
  if (completion.status === "UNAVAILABLE") {
    throw new ApplicationApiError("DEPENDENCY_UNAVAILABLE", "프로필 상태를 확인할 수 없습니다.");
  }
  return completion;
}

function acceptHandoff(projectId: string, applicationId: string): AcceptApplicationResponse["handoff"] {
  return { projectId, acceptedApplicationId: applicationId, transactionStatus: "CONTRACT_PENDING" };
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
    status: "ACCEPTED",
    decision: "ACCEPTED",
    decidedAt,
    operationId: operation.operationId,
    postActionsStatus: operation.status,
    replayed,
    handoff: acceptHandoff(projectId, applicationId),
  };
}

async function drainIfReady(deps: ApplicationServiceDeps): Promise<void> {
  if (deps.holdOutbox) return;
  await processOutbox(deps);
}

export async function processOutbox(deps: ApplicationServiceDeps): Promise<void> {
  for (const queued of deps.store.listQueuedOperations()) {
    await runOperation(deps, queued);
  }
}

function leaseUntilIso(nowIso: string): string {
  return new Date(Date.parse(nowIso) + 30_000).toISOString();
}

function queuedSteps(type: ApplicationOperation["type"]): ApplicationOperation["steps"] {
  if (type === "ACCEPT") {
    return [
      { name: "REJECT_OTHERS", status: "QUEUED", reason: null },
      { name: "CREATE_NOTIFICATIONS", status: "QUEUED", reason: null },
      { name: "ENSURE_NEGOTIATION_CONTEXT", status: "QUEUED", reason: null },
    ];
  }
  return [{ name: "CREATE_NOTIFICATIONS", status: "QUEUED", reason: null }];
}

async function runOperation(deps: ApplicationServiceDeps, operation: ApplicationOperation): Promise<void> {
  const nowIso = deps.now();
  const running: ApplicationOperation = {
    ...operation,
    status: "RUNNING",
    updatedAt: nowIso,
    attempts: operation.attempts + 1,
    leaseUntil: leaseUntilIso(nowIso),
  };
  deps.store.saveOperation(running);
  const row = deps.store.getApplication(operation.applicationId);
  const project = deps.store.getProject(operation.projectId);
  if (!row) {
    deps.store.saveOperation({
      ...running,
      status: "FAILED",
      leaseUntil: null,
      requiresOperatorAction: true,
    });
    return;
  }

  const steps = running.steps.map((step) => ({ ...step }));
  if (operation.type === "ACCEPT") {
    const rejectStep = steps.find((step) => step.name === "REJECT_OTHERS");
    if (rejectStep) {
      const autoRejectedIds: string[] = [];
      for (const other of deps.store.getByProject(row.projectId)) {
        if (other.applicationId === row.applicationId || other.status !== "PENDING") continue;
        const rejected = {
          ...other,
          status: "REJECTED" as const,
          rejectionType: "AUTO_OTHER_ACCEPTED" as const,
          decidedAt: nowIso,
        };
        deps.store.saveApplication(rejected);
        recordTransition(deps.store, rejected, "PENDING", nowIso);
        autoRejectedIds.push(other.applicationId);
      }
      rejectStep.status = "SUCCEEDED";
      const notifyStep = steps.find((step) => step.name === "CREATE_NOTIFICATIONS");
      if (notifyStep) {
        for (const rejectedId of autoRejectedIds) {
          await publish(deps, {
            type: "APPLICATION_AUTO_REJECTED",
            projectId: row.projectId,
            applicationId: rejectedId,
            occurredAt: nowIso,
          });
        }
        await publish(deps, {
          type: "APPLICATION_ACCEPTED",
          projectId: row.projectId,
          applicationId: row.applicationId,
          occurredAt: nowIso,
        });
        notifyStep.status = "SUCCEEDED";
      }
    }
    const handoffStep = steps.find((step) => step.name === "ENSURE_NEGOTIATION_CONTEXT");
    if (handoffStep) {
      const ready = project?.acceptedApplicationId === row.applicationId && project.transactionStatus === "CONTRACT_PENDING";
      handoffStep.status = ready ? "SUCCEEDED" : "FAILED";
      if (!ready) handoffStep.reason = "HANDOFF_MISSING";
    }
  } else {
    const notifyStep = steps.find((step) => step.name === "CREATE_NOTIFICATIONS");
    if (notifyStep) {
      await publish(deps, {
        type: "APPLICATION_REJECTED",
        projectId: row.projectId,
        applicationId: row.applicationId,
        occurredAt: nowIso,
      });
      notifyStep.status = "SUCCEEDED";
    }
  }

  const failed = steps.some((step) => step.status === "FAILED");
  deps.store.saveOperation({
    ...running,
    steps,
    status: failed ? "FAILED" : "SUCCEEDED",
    updatedAt: deps.now(),
    leaseUntil: null,
    requiresOperatorAction: failed,
  });
}

export async function getApplicationEligibility(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
): Promise<EligibilityResponse> {
  const actor = requireActor(actorUserId);
  const project = requireProject(deps.store, projectId);
  if (actor === project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  const blockedReasons: EligibilityBlockedReason[] = [];
  const existing = deps.store.findByProjectFreelancer(projectId, actor);
  if (existing) blockedReasons.push("ALREADY_APPLIED");
  if (project.transactionStatus === "CANCELED") blockedReasons.push("PROJECT_CANCELED");
  if (project.recruitmentStatus !== "OPEN") blockedReasons.push("RECRUITMENT_NOT_OPEN");
  if (project.recruitmentDeadlineAt && project.recruitmentDeadlineAt <= deps.now()) {
    blockedReasons.push("DEADLINE_PASSED");
  }

  const skipProfile =
    blockedReasons.includes("ALREADY_APPLIED") ||
    blockedReasons.includes("PROJECT_CANCELED") ||
    blockedReasons.includes("RECRUITMENT_NOT_OPEN") ||
    blockedReasons.includes("DEADLINE_PASSED");

  let profileCompletion: EligibilityResponse["profileCompletion"] = null;
  if (!skipProfile) {
    const completion = await requireProfile(deps, actor);
    profileCompletion = completion;
    if (completion.status === "INCOMPLETE") blockedReasons.push("PROFILE_INCOMPLETE");
  }

  return {
    projectId,
    canApply: blockedReasons.length === 0,
    blockedReasons,
    existingApplicationId: existing?.applicationId ?? null,
    profileCompletion,
  };
}

export async function createApplication(
  deps: ApplicationServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  input: CreateApplicationBody,
  idempotencyKey: string | undefined,
): Promise<CreateApplicationResult> {
  const actor = requireActor(actorUserId);
  // 허용 필드·범위부터 검사하고 모집 상태는 그 다음에 본다.
  assertCreateAllowlist(input);
  const parsed = parseCreateInput(input);
  const project = requireProject(deps.store, projectId);
  if (actor === project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  const completion = await requireProfile(deps, actor);
  if (completion.status === "INCOMPLETE") {
    throw new ApplicationApiError("PROFILE_INCOMPLETE", MSG_PROFILE_INCOMPLETE);
  }
  // 모집이 열린 뒤에만 INSERT한다.
  if (project.recruitmentStatus !== "OPEN") {
    throw new ApplicationApiError("PROJECT_TRANSITION_CONFLICT", "모집이 마감되었습니다.");
  }
  if (idempotencyKey) {
    const cached = deps.store.getIdempotency(idempotencyKey);
    if (cached) {
      if (cached.bodyHash !== bodyHash(parsed)) {
        throw new ApplicationApiError("APPLICATION_ALREADY_EXISTS", "이미 지원한 프로젝트입니다.");
      }
      const existing = deps.store.getApplication(cached.applicationId);
      if (existing) return { httpStatus: 200, body: toItem(existing) };
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
    coverLetter: parsed.coverLetter,
    expectedAmount: parsed.expectedAmount,
    expectedDurationDays: parsed.expectedDurationDays,
    status: "PENDING",
    rejectionType: null,
    decidedAt: null,
    createdAt: nowIso,
  };
  deps.store.insertApplication(row);
  recordTransition(deps.store, row, null, nowIso);
  // 누적·대기는 성공 INSERT에서만 올린다.
  deps.store.saveProject({
    ...project,
    applicationCount: project.applicationCount + 1,
    pendingApplicationCount: project.pendingApplicationCount + 1,
  });
  if (idempotencyKey) deps.store.setIdempotency(idempotencyKey, bodyHash(parsed), row.applicationId);
  await publish(deps, {
    type: "APPLICATION_SUBMITTED",
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
  const project = requireProject(deps.store, projectId);
  if (actor !== project.clientId) {
    throw new ApplicationApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  const filtered = sortNewest(deps.store.getByProject(projectId)).filter((row) =>
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
  const filtered = sortNewest(deps.store.getByFreelancer(actor)).filter((row) =>
    query?.status ? row.status === query.status : true,
  );
  const page = paginate(filtered, query);
  return {
    items: page.slice.map((row) => {
      const project = deps.store.getProject(row.projectId);
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
  const row = deps.store.getApplication(applicationId);
  if (!row) {
    throw new ApplicationApiError("APPLICATION_NOT_FOUND", "지원을 찾을 수 없습니다.");
  }
  const project = deps.store.getProject(row.projectId);
  const isOwner = actor === row.freelancerId;
  const isClient = project?.clientId === actor;
  if (!isOwner && !isClient) {
    throw new ApplicationApiError("APPLICATION_NOT_FOUND", "지원을 찾을 수 없습니다.");
  }
  return toDetail(row, project);
}

export async function getApplicationOperation(
  deps: ApplicationServiceDeps,
  operationId: string,
  actorUserId: string | undefined,
): Promise<ApplicationOperation> {
  const actor = requireActor(actorUserId);
  const operation = deps.store.getOperation(operationId);
  if (!operation || operation.clientId !== actor) {
    throw new ApplicationApiError("OPERATION_NOT_FOUND", "후속 작업을 찾을 수 없습니다.");
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
  const existingOp = deps.store
    .getOperations()
    .find((item) => item.applicationId === applicationId && item.type === "ACCEPT");
  if (project.acceptedApplicationId === applicationId && (cached?.applicationId === applicationId || existingOp)) {
    const operation = (cached?.operationId ? deps.store.getOperation(cached.operationId) : undefined) ?? existingOp;
    if (operation) {
      return toAcceptBody(200, applicationId, row.projectId, row.decidedAt ?? deps.now(), operation, true);
    }
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
  // ① C-01이 성공한 뒤에만 후속을 큐에 넣는다.
  await deps.projectApplications.acceptProjectApplication(row.projectId, applicationId);
  const nowIso = deps.now();
  const accepted: ApplicationRow = {
    ...row,
    status: "ACCEPTED",
    rejectionType: null,
    decidedAt: nowIso,
  };
  deps.store.saveApplication(accepted);
  recordTransition(deps.store, accepted, "PENDING", nowIso);
  const operation: ApplicationOperation = {
    operationId: deps.store.nextOperationId(),
    applicationId,
    projectId: row.projectId,
    clientId: actor,
    type: "ACCEPT",
    status: "QUEUED",
    steps: queuedSteps("ACCEPT"),
    updatedAt: nowIso,
    retryAfterSeconds: 5,
    requiresOperatorAction: false,
    leaseUntil: null,
    attempts: 0,
  };
  deps.store.saveOperation(operation);
  deps.store.setIdempotency(acceptKey, applicationId, applicationId, operation.operationId);
  await drainIfReady(deps);
  const finalOp = deps.store.getOperation(operation.operationId) ?? operation;
  const httpStatus: 200 | 202 = finalOp.status === "SUCCEEDED" ? 200 : 202;
  return toAcceptBody(httpStatus, applicationId, row.projectId, nowIso, finalOp, false);
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
    return {
      httpStatus: 200,
      applicationId,
      status: "REJECTED",
      rejectionType: "DIRECT",
      decision: "REJECTED",
      decidedAt: row.decidedAt,
      operationId: null,
      postActionsStatus: "SUCCEEDED",
      replayed: true,
    };
  }
  const nowIso = deps.now();
  const rejected: ApplicationRow = {
    ...row,
    status: "REJECTED",
    rejectionType: "DIRECT",
    decidedAt: nowIso,
  };
  deps.store.saveApplication(rejected);
  recordTransition(deps.store, rejected, "PENDING", nowIso);
  // DIRECT 신규 거절만 대기를 내린다.
  deps.store.saveProject({
    ...project,
    pendingApplicationCount: Math.max(project.pendingApplicationCount - 1, 0),
  });
  const operation: ApplicationOperation = {
    operationId: deps.store.nextOperationId(),
    applicationId,
    projectId: row.projectId,
    clientId: actor,
    type: "REJECT",
    status: "QUEUED",
    steps: queuedSteps("REJECT"),
    updatedAt: nowIso,
    retryAfterSeconds: 5,
    requiresOperatorAction: false,
    leaseUntil: null,
    attempts: 0,
  };
  deps.store.saveOperation(operation);
  await drainIfReady(deps);
  const finalOp = deps.store.getOperation(operation.operationId) ?? operation;
  const httpStatus: 200 | 202 = finalOp.status === "SUCCEEDED" ? 200 : 202;
  return {
    httpStatus,
    applicationId,
    status: "REJECTED",
    rejectionType: "DIRECT",
    decision: "REJECTED",
    decidedAt: nowIso,
    operationId: finalOp.operationId,
    postActionsStatus: finalOp.status,
    replayed: false,
  };
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
  requireProject(deps.store, projectId);
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
  // 취소는 GAP-01: rejection_type NULL. 마감만 AUTO_RECRUITMENT_CLOSED.
  const rejectionType = input.reason === "PROJECT_CANCELED" ? null : ("AUTO_RECRUITMENT_CLOSED" as const);
  for (const row of pending) {
    const rejected: ApplicationRow = {
      ...row,
      status: "REJECTED",
      rejectionType,
      decidedAt: input.occurredAt,
    };
    deps.store.saveApplication(rejected);
    recordTransition(deps.store, rejected, "PENDING", input.occurredAt);
    await publish(deps, {
      type: "APPLICATION_AUTO_REJECTED",
      projectId,
      applicationId: row.applicationId,
      occurredAt: input.occurredAt,
    });
  }
  // 대기 건수 0은 PM 호출자가 둔다.
  const done: RejectPendingApplicationsResult = {
    rejectedCount: pending.length,
    alreadyProcessed: false,
    result: "DONE",
  };
  deps.store.setClosure(input.closureEventId, done);
  return done;
}
