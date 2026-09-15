import type {
  AcceptProjectApplicationPort,
  AcceptProjectApplicationResult,
} from "../server/accept-project-application.port";
import {
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_INCOMPLETE_USER_ID,
  MOCK_NOW,
} from "../server/application.constants";
import {
  acceptApplication,
  createApplication,
  getApplication,
  getApplicationEligibility,
  getApplicationOperation,
  listMyApplications,
  listProjectApplications,
  processOutbox,
  rejectApplication,
  rejectPendingApplications,
  type ApplicationServiceDeps,
} from "../server/application.service";
import {
  ApplicationApiError,
  type ApplicationNotificationEvent,
  type ApplicationNotificationPort,
  type ApplicationOperation,
  type ApplicationRow,
  type ApplicationStateEvent,
  type ApplicationStore,
  type CreateApplicationBody,
  type IdempotencyRecord,
  type ListQuery,
  type ProjectApplicationContext,
  type RejectPendingApplicationsResult,
} from "../server/application.types";
import type { ProfileCompletion, ProfileCompletionPort } from "../server/profile-completion.port";

function createMemoryStore(): ApplicationStore {
  const projects = new Map<string, ProjectApplicationContext>();
  const applications: ApplicationRow[] = [];
  const idempotency = new Map<string, IdempotencyRecord>();
  const closures = new Map<string, RejectPendingApplicationsResult>();
  const operations = new Map<string, ApplicationOperation>();
  const stateEvents: ApplicationStateEvent[] = [];
  let seq = 100;
  let opSeq = 100;

  function addProject(row: ProjectApplicationContext): void {
    projects.set(row.projectId, row);
  }

  addProject({
    projectId: "prj_open",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "OPEN",
    transactionStatus: "NONE",
    acceptedApplicationId: null,
    applicationCount: 0,
    pendingApplicationCount: 0,
  });
  addProject({
    projectId: "prj_closed",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "CLOSED",
    transactionStatus: "NONE",
    acceptedApplicationId: null,
    applicationCount: 1,
    pendingApplicationCount: 1,
  });
  addProject({
    projectId: "prj_scheduled",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "SCHEDULED",
    transactionStatus: "NONE",
    acceptedApplicationId: null,
    applicationCount: 0,
    pendingApplicationCount: 0,
  });
  addProject({
    projectId: "prj_taken",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_taken",
    applicationCount: 1,
    pendingApplicationCount: 0,
  });
  applications.push({
    applicationId: "app_taken",
    projectId: "prj_taken",
    freelancerId: MOCK_FREELANCER_USER_ID,
    coverLetter: "이미 수락됨",
    expectedAmount: 100000,
    expectedDurationDays: 10,
    status: "ACCEPTED",
    rejectionType: null,
    decidedAt: MOCK_NOW,
    createdAt: MOCK_NOW,
  });
  applications.push({
    applicationId: "app_closed_pending",
    projectId: "prj_closed",
    freelancerId: MOCK_FREELANCER_USER_ID,
    coverLetter: "마감 후 남은 지원",
    expectedAmount: 100000,
    expectedDurationDays: 10,
    status: "PENDING",
    rejectionType: null,
    decidedAt: null,
    createdAt: MOCK_NOW,
  });
  addProject({
    projectId: "prj_completed",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "CLOSED",
    transactionStatus: "COMPLETED",
    acceptedApplicationId: "app_completed",
    applicationCount: 1,
    pendingApplicationCount: 0,
  });
  applications.push({
    applicationId: "app_completed",
    projectId: "prj_completed",
    freelancerId: MOCK_FREELANCER_USER_ID,
    coverLetter: "완료된 거래",
    expectedAmount: 100000,
    expectedDurationDays: 10,
    status: "ACCEPTED",
    rejectionType: null,
    decidedAt: MOCK_NOW,
    createdAt: MOCK_NOW,
  });
  applications.push({
    applicationId: "app_deleted",
    projectId: "prj_deleted",
    freelancerId: MOCK_FREELANCER_USER_ID,
    coverLetter: "삭제된 프로젝트",
    expectedAmount: 100000,
    expectedDurationDays: 10,
    status: "PENDING",
    rejectionType: null,
    decidedAt: null,
    createdAt: MOCK_NOW,
  });
  addProject({
    projectId: "prj_canceled",
    clientId: MOCK_CLIENT_USER_ID,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CANCELED",
    acceptedApplicationId: null,
    applicationCount: 1,
    pendingApplicationCount: 0,
  });
  applications.push({
    applicationId: "app_canceled",
    projectId: "prj_canceled",
    freelancerId: MOCK_FREELANCER_USER_ID,
    coverLetter: "취소된 프로젝트",
    expectedAmount: 100000,
    expectedDurationDays: 10,
    status: "REJECTED",
    rejectionType: null,
    decidedAt: MOCK_NOW,
    createdAt: MOCK_NOW,
  });

  return {
    getProject(projectId) {
      const row = projects.get(projectId);
      return row ? { ...row } : undefined;
    },
    getApplication(applicationId) {
      const row = applications.find((item) => item.applicationId === applicationId);
      return row ? { ...row } : undefined;
    },
    getByProject(projectId) {
      return applications.filter((item) => item.projectId === projectId).map((row) => ({ ...row }));
    },
    getByFreelancer(freelancerId) {
      return applications.filter((item) => item.freelancerId === freelancerId).map((row) => ({ ...row }));
    },
    findByProjectFreelancer(projectId, freelancerId) {
      const row = applications.find(
        (item) => item.projectId === projectId && item.freelancerId === freelancerId,
      );
      return row ? { ...row } : undefined;
    },
    insertApplication(row) {
      applications.push({ ...row });
    },
    saveApplication(row) {
      const index = applications.findIndex((item) => item.applicationId === row.applicationId);
      if (index >= 0) applications[index] = { ...row };
      else applications.push({ ...row });
    },
    saveProject(row) {
      projects.set(row.projectId, { ...row });
    },
    getIdempotency(key) {
      const cached = idempotency.get(key);
      return cached ? { ...cached } : undefined;
    },
    setIdempotency(key, bodyHash, applicationId, operationId) {
      idempotency.set(key, { bodyHash, applicationId, operationId });
    },
    getClosure(closureEventId) {
      const cached = closures.get(closureEventId);
      return cached ? { ...cached } : undefined;
    },
    setClosure(closureEventId, result) {
      closures.set(closureEventId, { ...result });
    },
    nextApplicationId() {
      seq += 1;
      return `app_${seq}`;
    },
    nextOperationId() {
      opSeq += 1;
      return `op_${opSeq}`;
    },
    saveOperation(row) {
      operations.set(row.operationId, {
        ...row,
        steps: row.steps.map((step) => ({ ...step })),
      });
    },
    getOperation(operationId) {
      const row = operations.get(operationId);
      return row ? { ...row, steps: row.steps.map((step) => ({ ...step })) } : undefined;
    },
    getOperations() {
      return [...operations.values()].map((row) => ({
        ...row,
        steps: row.steps.map((step) => ({ ...step })),
      }));
    },
    listQueuedOperations() {
      return [...operations.values()]
        .filter((row) => row.status === "QUEUED" || row.status === "RUNNING")
        .map((row) => ({ ...row, steps: row.steps.map((step) => ({ ...step })) }));
    },
    appendStateEvent(event) {
      stateEvents.push({ ...event });
    },
    getStateEvents(applicationId) {
      return stateEvents.filter((event) => event.applicationId === applicationId).map((event) => ({ ...event }));
    },
  };
}

function createRecordingNotifications(events: ApplicationNotificationEvent[]): ApplicationNotificationPort {
  return {
    async publish(event) {
      events.push({ ...event });
    },
  };
}

function createStandInProjectApplications(store: ApplicationStore): AcceptProjectApplicationPort {
  return {
    async acceptProjectApplication(projectId, applicationId) {
      const project = store.getProject(projectId);
      if (!project) {
        throw new ApplicationApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
      }
      if (project.acceptedApplicationId === applicationId) {
        return {
          projectId,
          acceptedApplicationId: applicationId,
          recruitmentStatus: "CLOSED",
          transactionStatus: "CONTRACT_PENDING",
          alreadyProcessed: true,
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
      // 모집 마감·계약 대기. 대기 건수는 PM이 0으로 둔다.
      store.saveProject({
        ...project,
        recruitmentStatus: "CLOSED",
        transactionStatus: "CONTRACT_PENDING",
        acceptedApplicationId: applicationId,
        pendingApplicationCount: 0,
      });
      const result: AcceptProjectApplicationResult = {
        projectId,
        acceptedApplicationId: applicationId,
        recruitmentStatus: "CLOSED",
        transactionStatus: "CONTRACT_PENDING",
        alreadyProcessed: false,
      };
      return result;
    },
  };
}

/** 기본 시드: 알려진 프리랜서는 COMPLETE. 미완성 사용자만 INCOMPLETE. */
export function createDefaultProfilePort(): ProfileCompletionPort {
  return {
    async getProfileCompletion(userId: string): Promise<ProfileCompletion> {
      if (userId === MOCK_INCOMPLETE_USER_ID) {
        return { status: "INCOMPLETE", completedAt: null, missingFields: ["FREELANCER_SKILLS"] };
      }
      return { status: "COMPLETE", completedAt: MOCK_NOW, missingFields: [] };
    },
  };
}

export function createUnavailableProfilePort(): ProfileCompletionPort {
  return {
    async getProfileCompletion(): Promise<ProfileCompletion> {
      return { status: "UNAVAILABLE", completedAt: null, missingFields: [] };
    },
  };
}

export type ApplicationApiMockOptions = {
  projectApplications?: AcceptProjectApplicationPort;
  profiles?: ProfileCompletionPort;
  omitProfilePort?: boolean;
  holdOutbox?: boolean;
};

/** Increment 공개 API 스탠드인. 발송하지 않는다. */
export function createApplicationApiMock(
  nowIso: string = MOCK_NOW,
  options: ApplicationApiMockOptions = {},
) {
  const store = createMemoryStore();
  const published: ApplicationNotificationEvent[] = [];
  const deps: ApplicationServiceDeps = {
    store,
    notifications: createRecordingNotifications(published),
    projectApplications: options.projectApplications ?? createStandInProjectApplications(store),
    profiles: options.omitProfilePort ? undefined : (options.profiles ?? createDefaultProfilePort()),
    now: () => nowIso,
    holdOutbox: options.holdOutbox,
  };

  return {
    getPublishedEvents(): ApplicationNotificationEvent[] {
      return [...published];
    },
    getProject(projectId: string) {
      return store.getProject(projectId);
    },
    getApplicationRow(applicationId: string) {
      return store.getApplication(applicationId);
    },
    getStateEvents(applicationId: string) {
      return store.getStateEvents(applicationId);
    },
    async processOutbox() {
      return processOutbox(deps);
    },
    async createApplication(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateApplicationBody,
      idempotencyKey?: string,
    ) {
      return createApplication(deps, projectId, actorUserId, input, idempotencyKey);
    },
    async getApplicationEligibility(projectId: string, actorUserId: string | undefined) {
      return getApplicationEligibility(deps, projectId, actorUserId);
    },
    async getApplication(applicationId: string, actorUserId: string | undefined) {
      return getApplication(deps, applicationId, actorUserId);
    },
    async getApplicationOperation(operationId: string, actorUserId: string | undefined) {
      return getApplicationOperation(deps, operationId, actorUserId);
    },
    async listProjectApplications(projectId: string, actorUserId: string | undefined, query?: ListQuery) {
      return listProjectApplications(deps, projectId, actorUserId, query);
    },
    async listMyApplications(actorUserId: string | undefined, query?: ListQuery) {
      return listMyApplications(deps, actorUserId, query);
    },
    async acceptApplication(applicationId: string, actorUserId: string | undefined, idempotencyKey?: string) {
      return acceptApplication(deps, applicationId, actorUserId, idempotencyKey);
    },
    async rejectApplication(applicationId: string, actorUserId: string | undefined) {
      return rejectApplication(deps, applicationId, actorUserId);
    },
    async rejectPendingApplications(projectId: string, input: Parameters<typeof rejectPendingApplications>[2]) {
      return rejectPendingApplications(deps, projectId, input);
    },
  };
}
