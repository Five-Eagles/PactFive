import type {
  ApplicationOperation,
  ApplicationRepository,
  ApplicationRow,
  ApplicationStateEvent,
  IdempotencyRecord,
  RejectPendingApplicationsResult,
} from './application.types';

/**
 * 원본: features/applications/prototype/mock/application.mock.ts의 `createMemoryStore` 중
 * 지원 행·멱등·closure·operation·상태 이력 부분만 옮겼다(PR #83로 operation·상태 이력 추가) —
 * 프로젝트 컨텍스트는 `ProjectApplicationContextPort`가 project-management에서 직접 읽으므로
 * 여기서 복제하지 않는다.
 *
 * Prisma 도입 전까지 in-memory (다른 기능들과 같은 원칙 — app/server/AGENTS.md).
 *
 * 2026-09-08 팀장 반영: ApplicationRepository가 Promise 반환으로 바뀌면서, 이미 동기로 계산한
 * 값을 Promise.resolve로 감싸기만 했다 — 내부 로직·자료구조는 그대로다.
 */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications: ApplicationRow[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly closures = new Map<string, RejectPendingApplicationsResult>();
  private readonly operations: ApplicationOperation[] = [];
  private readonly stateEvents: ApplicationStateEvent[] = [];
  private seq = 100;
  private operationSeq = 100;

  async getApplication(applicationId: string): Promise<ApplicationRow | undefined> {
    const row = this.applications.find((item) => item.applicationId === applicationId);
    return row ? { ...row } : undefined;
  }

  async getByProject(projectId: string): Promise<ApplicationRow[]> {
    return this.applications.filter((item) => item.projectId === projectId).map((row) => ({ ...row }));
  }

  async getByFreelancer(freelancerId: string): Promise<ApplicationRow[]> {
    return this.applications
      .filter((item) => item.freelancerId === freelancerId)
      .map((row) => ({ ...row }));
  }

  async findByProjectFreelancer(projectId: string, freelancerId: string): Promise<ApplicationRow | undefined> {
    const row = this.applications.find(
      (item) => item.projectId === projectId && item.freelancerId === freelancerId,
    );
    return row ? { ...row } : undefined;
  }

  async insertApplication(row: ApplicationRow): Promise<void> {
    this.applications.push({ ...row });
  }

  async saveApplication(row: ApplicationRow): Promise<void> {
    const index = this.applications.findIndex((item) => item.applicationId === row.applicationId);
    if (index >= 0) this.applications[index] = { ...row };
    else this.applications.push({ ...row });
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
    const cached = this.idempotency.get(key);
    return cached ? { ...cached } : undefined;
  }

  async setIdempotency(key: string, bodyHash: string, applicationId: string, operationId?: string): Promise<void> {
    this.idempotency.set(key, { bodyHash, applicationId, operationId });
  }

  async getClosure(closureEventId: string): Promise<RejectPendingApplicationsResult | undefined> {
    const cached = this.closures.get(closureEventId);
    return cached ? { ...cached } : undefined;
  }

  async setClosure(closureEventId: string, result: RejectPendingApplicationsResult): Promise<void> {
    this.closures.set(closureEventId, { ...result });
  }

  async nextApplicationId(): Promise<string> {
    this.seq += 1;
    return `app_${this.seq}`;
  }

  async nextOperationId(): Promise<string> {
    this.operationSeq += 1;
    return `appop_${this.operationSeq}`;
  }

  async saveOperation(row: ApplicationOperation): Promise<void> {
    const index = this.operations.findIndex((item) => item.operationId === row.operationId);
    const copy = { ...row, steps: row.steps.map((step) => ({ ...step })) };
    if (index >= 0) this.operations[index] = copy;
    else this.operations.push(copy);
  }

  async getOperation(operationId: string): Promise<ApplicationOperation | undefined> {
    const row = this.operations.find((item) => item.operationId === operationId);
    return row ? { ...row, steps: row.steps.map((step) => ({ ...step })) } : undefined;
  }

  async getOperations(): Promise<ApplicationOperation[]> {
    return this.operations.map((row) => ({ ...row, steps: row.steps.map((step) => ({ ...step })) }));
  }

  async listQueuedOperations(): Promise<ApplicationOperation[]> {
    return this.operations
      .filter((row) => row.status === 'QUEUED')
      .map((row) => ({ ...row, steps: row.steps.map((step) => ({ ...step })) }));
  }

  async appendStateEvent(event: ApplicationStateEvent): Promise<void> {
    this.stateEvents.push({ ...event });
  }

  async getStateEvents(applicationId: string): Promise<ApplicationStateEvent[]> {
    return this.stateEvents.filter((event) => event.applicationId === applicationId).map((event) => ({ ...event }));
  }
}
