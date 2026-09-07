import type {
  AcceptProjectApplicationPort,
  AcceptProjectApplicationResult,
} from "../server/accept-project-application.port";
import {
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_NOW,
} from "../server/application.constants";
import {
  acceptApplication,
  createApplication,
  listMyApplications,
  listProjectApplications,
  rejectApplication,
  rejectPendingApplications,
  type ApplicationServiceDeps,
} from "../server/application.service";
import {
  ApplicationApiError,
  type ApplicationNotificationEvent,
  type ApplicationNotificationPort,
  type ApplicationRow,
  type ApplicationStore,
  type CreateApplicationInput,
  type ProjectApplicationContext,
  type RejectPendingApplicationsResult,
} from "../server/application.types";

function createMemoryStore(): ApplicationStore {
  const projects = new Map<string, ProjectApplicationContext>();
  const applications: ApplicationRow[] = [];
  const idempotency = new Map<string, { bodyHash: string; applicationId: string }>();
  const closures = new Map<string, RejectPendingApplicationsResult>();
  let seq = 100;

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
    setIdempotency(key, bodyHash, applicationId) {
      idempotency.set(key, { bodyHash, applicationId });
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
      // 모집 마감·계약 대기만 심고, 잔여 거절은 호출자가 한다.
      store.saveProject({
        ...project,
        recruitmentStatus: "CLOSED",
        transactionStatus: "CONTRACT_PENDING",
        acceptedApplicationId: applicationId,
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

export type ApplicationApiMockOptions = {
  projectApplications?: AcceptProjectApplicationPort;
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
    now: () => nowIso,
  };

  return {
    getPublishedEvents(): ApplicationNotificationEvent[] {
      return [...published];
    },
    getProject(projectId: string) {
      return store.getProject(projectId);
    },
    async createApplication(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateApplicationInput,
      idempotencyKey?: string,
    ) {
      return createApplication(deps, projectId, actorUserId, input, idempotencyKey);
    },
    async listProjectApplications(projectId: string, actorUserId: string | undefined) {
      return listProjectApplications(deps, projectId, actorUserId);
    },
    async listMyApplications(actorUserId: string | undefined) {
      return listMyApplications(deps, actorUserId);
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

