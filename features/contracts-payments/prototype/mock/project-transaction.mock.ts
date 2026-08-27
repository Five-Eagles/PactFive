import { MOCK_INTERNAL_SERVICE_TOKEN } from "../server/project-transaction.constants";
import type { ProjectTransactionPort } from "../server/project-transaction.port";
import {
  DomainContractError,
  type CompleteProjectTransactionInput,
  type CompleteProjectTransactionResponse,
  type MarkPaymentPendingInput,
  type MarkPaymentPendingResponse,
  type ProjectNegotiationContextResponse,
  type ProjectTransactionStatus,
  type RecruitmentStatus,
  type RestorePreContractProjectInput,
  type RestorePreContractProjectResponse,
  type RestoreReason,
  type StartProjectTransactionInput,
  type StartProjectTransactionResponse,
} from "../server/project-transaction.types";

export const MOCK_NOW = "2026-08-25T05:00:00Z";

type ProjectRecord = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string;
  canceledAt: string | null;
  paymentPendingAt: string | null;
  projectVersion: number;
  deletedAt: string | null;
  pendingApplicationCount: number;
  recruitmentStartAt: string;
  restoredNegotiationId: string | null;
  lastRestoreResponse: RestorePreContractProjectResponse | null;
};

type IdempotencyStore = Map<string, unknown>;

function seedProjects(): Map<string, ProjectRecord> {
  const rows: ProjectRecord[] = [
    baseProject("prj_alive"),
    { ...baseProject("prj_deleted"), deletedAt: "2026-08-20T00:00:00Z" },
    {
      ...baseProject("prj_canceled"),
      transactionStatus: "CANCELED",
      canceledAt: "2026-08-24T00:00:00Z",
    },
    { ...baseProject("prj_null_accept"), acceptedApplicationId: null },
    { ...baseProject("prj_in_progress"), transactionStatus: "IN_PROGRESS", projectVersion: 8 },
    { ...baseProject("prj_completed"), transactionStatus: "COMPLETED", projectVersion: 9 },
    {
      ...baseProject("prj_deadline"),
      recruitmentDeadlineAt: "2026-08-01T00:00:00Z",
    },
    { ...baseProject("prj_pending_apps"), pendingApplicationCount: 2 },
    baseProject("prj_seq"),
    baseProject("prj_restore"),
  ];
  return new Map(rows.map((row) => [row.projectId, row]));
}

function baseProject(projectId: string): ProjectRecord {
  return {
    projectId,
    clientId: "usr_client_a",
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_123",
    recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
    canceledAt: null,
    paymentPendingAt: null,
    projectVersion: 7,
    deletedAt: null,
    pendingApplicationCount: 0,
    recruitmentStartAt: "2026-07-01T00:00:00Z",
    restoredNegotiationId: null,
    lastRestoreResponse: null,
  };
}

function requireEnvelope(
  input: { requestId?: string; idempotencyKey?: string; occurredAt?: string },
): void {
  const details: Array<{ field: string; reason: string }> = [];
  if (!input.requestId) details.push({ field: "requestId", reason: "required" });
  if (!input.idempotencyKey) details.push({ field: "idempotencyKey", reason: "required" });
  if (!input.occurredAt) details.push({ field: "occurredAt", reason: "required" });
  if (details.length > 0) {
    throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", details);
  }
}

function toContext(row: ProjectRecord): ProjectNegotiationContextResponse {
  return {
    projectId: row.projectId,
    clientId: row.clientId,
    recruitmentStatus: row.recruitmentStatus,
    transactionStatus: row.transactionStatus,
    acceptedApplicationId: row.acceptedApplicationId,
    recruitmentDeadlineAt: row.recruitmentDeadlineAt,
    canceledAt: row.canceledAt,
    paymentPendingAt: row.paymentPendingAt,
    projectVersion: row.projectVersion,
  };
}

function idempotencyKeyOf(projectId: string, key: string): string {
  return `${projectId}:${key}`;
}

export type ProjectTransactionMockOptions = {
  serviceToken?: string;
};

/** 테스트마다 새 저장소를 만든다. 토큰이 다르면 모든 메서드를 거부한다. */
export function createProjectTransactionMock(
  nowIso: string = MOCK_NOW,
  options: ProjectTransactionMockOptions = {},
): ProjectTransactionPort & {
  getRecruitmentStartAt(projectId: string): string | null;
  getCallCounts(): Record<string, number>;
} {
  const serviceToken = options.serviceToken ?? MOCK_INTERNAL_SERVICE_TOKEN;
  const projects = seedProjects();
  const idempotency: IdempotencyStore = new Map();
  const callCounts = {
    getProjectNegotiationContext: 0,
    markPaymentPending: 0,
    startProjectTransaction: 0,
    completeProjectTransaction: 0,
    restorePreContractProject: 0,
  };

  function assertServiceToken(): void {
    if (serviceToken !== MOCK_INTERNAL_SERVICE_TOKEN) {
      throw new DomainContractError("VALIDATION_ERROR", "서버 간 토큰이 올바르지 않습니다.", [
        { field: "authorization", reason: "invalid" },
      ]);
    }
  }

  function findAlive(projectId: string): ProjectRecord {
    const row = projects.get(projectId);
    if (!row || row.deletedAt) {
      throw new DomainContractError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    }
    return row;
  }

  function cached<T>(projectId: string, key: string): T | undefined {
    return idempotency.get(idempotencyKeyOf(projectId, key)) as T | undefined;
  }

  function remember<T>(projectId: string, key: string, value: T): T {
    idempotency.set(idempotencyKeyOf(projectId, key), value);
    return value;
  }

  function assertVersion(row: ProjectRecord, expected?: number): void {
    if (expected !== undefined && expected !== row.projectVersion) {
      throw new DomainContractError(
        "PROJECT_VERSION_CONFLICT",
        "프로젝트 버전이 일치하지 않습니다.",
      );
    }
  }

  const port: ProjectTransactionPort & {
    getRecruitmentStartAt(projectId: string): string | null;
    getCallCounts(): Record<string, number>;
  } = {
    getRecruitmentStartAt(projectId: string): string | null {
      return projects.get(projectId)?.recruitmentStartAt ?? null;
    },
    getCallCounts() {
      return { ...callCounts };
    },

    async getProjectNegotiationContext(projectId: string) {
      assertServiceToken();
      callCounts.getProjectNegotiationContext += 1;
      return toContext(findAlive(projectId));
    },

    async markPaymentPending(projectId: string, input: MarkPaymentPendingInput) {
      assertServiceToken();
      callCounts.markPaymentPending += 1;
      requireEnvelope(input);
      if (!input.contractId) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "contractId", reason: "required" },
        ]);
      }
      const hit = cached<MarkPaymentPendingResponse>(projectId, input.idempotencyKey);
      if (hit) return hit;
      const row = findAlive(projectId);
      if (row.transactionStatus !== "CONTRACT_PENDING" || row.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      assertVersion(row, input.expectedProjectVersion);
      // 이미 찍힌 시각은 최초값을 유지한다 (P4).
      if (row.paymentPendingAt) {
        return remember(projectId, input.idempotencyKey, {
          projectId: row.projectId,
          transactionStatus: row.transactionStatus,
          paymentPendingAt: row.paymentPendingAt,
          alreadyProcessed: true,
          processedAt: input.occurredAt,
          changed: false,
          projectVersion: row.projectVersion,
        });
      }
      row.paymentPendingAt = input.occurredAt;
      return remember(projectId, input.idempotencyKey, {
        projectId: row.projectId,
        transactionStatus: row.transactionStatus,
        paymentPendingAt: row.paymentPendingAt,
        alreadyProcessed: false,
        processedAt: input.occurredAt,
        changed: true,
        projectVersion: row.projectVersion,
      });
    },

    async startProjectTransaction(projectId: string, input: StartProjectTransactionInput) {
      assertServiceToken();
      callCounts.startProjectTransaction += 1;
      requireEnvelope(input);
      if (input.expectedProjectVersion === undefined || input.expectedProjectVersion === null) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "expectedProjectVersion", reason: "required" },
        ]);
      }
      const hit = cached<StartProjectTransactionResponse>(projectId, input.idempotencyKey);
      if (hit) return hit;
      const row = findAlive(projectId);
      if (row.transactionStatus === "IN_PROGRESS") {
        return remember(projectId, input.idempotencyKey, {
          projectId: row.projectId,
          recruitmentStatus: row.recruitmentStatus,
          transactionStatus: "IN_PROGRESS" as const,
          alreadyProcessed: true,
          processedAt: input.occurredAt,
          changed: false,
          projectVersion: row.projectVersion,
        });
      }
      if (row.transactionStatus !== "CONTRACT_PENDING" || row.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (!row.acceptedApplicationId) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      assertVersion(row, input.expectedProjectVersion);
      row.transactionStatus = "IN_PROGRESS";
      row.projectVersion += 1;
      return remember(projectId, input.idempotencyKey, {
        projectId: row.projectId,
        recruitmentStatus: row.recruitmentStatus,
        transactionStatus: "IN_PROGRESS" as const,
        alreadyProcessed: false,
        processedAt: input.occurredAt,
        changed: true,
        projectVersion: row.projectVersion,
      });
    },

    async completeProjectTransaction(projectId: string, input: CompleteProjectTransactionInput) {
      assertServiceToken();
      callCounts.completeProjectTransaction += 1;
      requireEnvelope(input);
      if (input.expectedProjectVersion === undefined || input.expectedProjectVersion === null) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "expectedProjectVersion", reason: "required" },
        ]);
      }
      const hit = cached<CompleteProjectTransactionResponse>(projectId, input.idempotencyKey);
      if (hit) return hit;
      const row = findAlive(projectId);
      if (row.transactionStatus === "COMPLETED") {
        return remember(projectId, input.idempotencyKey, {
          projectId: row.projectId,
          recruitmentStatus: row.recruitmentStatus,
          transactionStatus: "COMPLETED" as const,
          alreadyProcessed: true,
          processedAt: input.occurredAt,
          changed: false,
          projectVersion: row.projectVersion,
        });
      }
      if (row.transactionStatus !== "IN_PROGRESS" || row.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      assertVersion(row, input.expectedProjectVersion);
      row.transactionStatus = "COMPLETED";
      row.projectVersion += 1;
      return remember(projectId, input.idempotencyKey, {
        projectId: row.projectId,
        recruitmentStatus: row.recruitmentStatus,
        transactionStatus: "COMPLETED" as const,
        alreadyProcessed: false,
        processedAt: input.occurredAt,
        changed: true,
        projectVersion: row.projectVersion,
      });
    },

    async restorePreContractProject(projectId: string, input: RestorePreContractProjectInput) {
      assertServiceToken();
      callCounts.restorePreContractProject += 1;
      requireEnvelope(input);
      const details: Array<{ field: string; reason: string }> = [];
      if (!input.negotiationId) details.push({ field: "negotiationId", reason: "required" });
      if (!input.actorUserId) details.push({ field: "actorUserId", reason: "required" });
      const reasons: RestoreReason[] = ["FREELANCER_REJECTED", "CLIENT_REJECTED"];
      if (!input.reason || !reasons.includes(input.reason)) {
        details.push({ field: "reason", reason: "invalid" });
      }
      if (details.length > 0) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", details);
      }
      const hit = cached<RestorePreContractProjectResponse>(projectId, input.idempotencyKey);
      if (hit) return hit;
      const row = findAlive(projectId);
      if (row.restoredNegotiationId === input.negotiationId && row.lastRestoreResponse) {
        return remember(projectId, input.idempotencyKey, {
          ...row.lastRestoreResponse,
          alreadyProcessed: true,
        });
      }
      if (row.restoredNegotiationId && row.restoredNegotiationId !== input.negotiationId) {
        throw new DomainContractError(
          "PROJECT_ALREADY_RESTORED",
          "이미 다른 협상으로 복원되었습니다.",
        );
      }
      if (row.transactionStatus !== "CONTRACT_PENDING" || row.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      assertVersion(row, input.expectedProjectVersion);
      const deadlineMs = Date.parse(row.recruitmentDeadlineAt);
      const nowMs = Date.parse(nowIso);
      const recruitmentStartAtBefore = row.recruitmentStartAt;
      row.transactionStatus = "NONE";
      row.restoredNegotiationId = input.negotiationId;
      let reopened = false;
      let notReopenedReason: RestorePreContractProjectResponse["notReopenedReason"] = null;
      if (deadlineMs > nowMs && row.pendingApplicationCount === 0) {
        row.recruitmentStatus = "OPEN";
        reopened = true;
        notReopenedReason = null;
      } else if (deadlineMs <= nowMs) {
        row.recruitmentStatus = "CLOSED";
        reopened = false;
        notReopenedReason = "DEADLINE_PASSED";
      } else {
        row.recruitmentStatus = "CLOSED";
        reopened = false;
        notReopenedReason = "PENDING_APPLICATIONS_REMAIN";
      }
      row.projectVersion += 1;
      row.recruitmentStartAt = recruitmentStartAtBefore;
      const response: RestorePreContractProjectResponse = {
        projectId: row.projectId,
        negotiationId: input.negotiationId,
        recruitmentStatus: row.recruitmentStatus,
        transactionStatus: "NONE",
        reopened,
        notReopenedReason,
        restoredFields: ["recruitmentStatus", "transactionStatus"],
        alreadyProcessed: false,
        processedAt: input.occurredAt,
        changed: true,
        projectVersion: row.projectVersion,
      };
      row.lastRestoreResponse = response;
      return remember(projectId, input.idempotencyKey, response);
    },
  };

  return port;
}
