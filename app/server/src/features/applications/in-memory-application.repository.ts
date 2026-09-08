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
 */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications: ApplicationRow[] = [];
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly closures = new Map<string, RejectPendingApplicationsResult>();
  private readonly operations: ApplicationOperation[] = [];
  private readonly stateEvents: ApplicationStateEvent[] = [];
  private seq = 100;
  private operationSeq = 100;

  getApplication(applicationId: string): ApplicationRow | undefined {
    const row = this.applications.find((item) => item.applicationId === applicationId);
    return row ? { ...row } : undefined;
  }

  getByProject(projectId: string): ApplicationRow[] {
    return this.applications.filter((item) => item.projectId === projectId).map((row) => ({ ...row }));
  }

  getByFreelancer(freelancerId: string): ApplicationRow[] {
    return this.applications
      .filter((item) => item.freelancerId === freelancerId)
      .map((row) => ({ ...row }));
  }

  findByProjectFreelancer(projectId: string, freelancerId: string): ApplicationRow | undefined {
    const row = this.applications.find(
      (item) => item.projectId === projectId && item.freelancerId === freelancerId,
    );
    return row ? { ...row } : undefined;
  }

  insertApplication(row: ApplicationRow): void {
    this.applications.push({ ...row });
  }

  saveApplication(row: ApplicationRow): void {
    const index = this.applications.findIndex((item) => item.applicationId === row.applicationId);
    if (index >= 0) this.applications[index] = { ...row };
    else this.applications.push({ ...row });
  }

  getIdempotency(key: string): IdempotencyRecord | undefined {
    const cached = this.idempotency.get(key);
    return cached ? { ...cached } : undefined;
  }

  setIdempotency(key: string, bodyHash: string, applicationId: string, operationId?: string): void {
    this.idempotency.set(key, { bodyHash, applicationId, operationId });
  }

  getClosure(closureEventId: string): RejectPendingApplicationsResult | undefined {
    const cached = this.closures.get(closureEventId);
    return cached ? { ...cached } : undefined;
  }

  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): void {
    this.closures.set(closureEventId, { ...result });
  }

  nextApplicationId(): string {
    this.seq += 1;
    return `app_${this.seq}`;
  }

  nextOperationId(): string {
    this.operationSeq += 1;
    return `appop_${this.operationSeq}`;
  }

  saveOperation(row: ApplicationOperation): void {
    const index = this.operations.findIndex((item) => item.operationId === row.operationId);
    const copy = { ...row, steps: row.steps.map((step) => ({ ...step })) };
    if (index >= 0) this.operations[index] = copy;
    else this.operations.push(copy);
  }

  getOperation(operationId: string): ApplicationOperation | undefined {
    const row = this.operations.find((item) => item.operationId === operationId);
    return row ? { ...row, steps: row.steps.map((step) => ({ ...step })) } : undefined;
  }

  getOperations(): ApplicationOperation[] {
    return this.operations.map((row) => ({ ...row, steps: row.steps.map((step) => ({ ...step })) }));
  }

  listQueuedOperations(): ApplicationOperation[] {
    return this.operations
      .filter((row) => row.status === 'QUEUED')
      .map((row) => ({ ...row, steps: row.steps.map((step) => ({ ...step })) }));
  }

  appendStateEvent(event: ApplicationStateEvent): void {
    this.stateEvents.push({ ...event });
  }

  getStateEvents(applicationId: string): ApplicationStateEvent[] {
    return this.stateEvents.filter((event) => event.applicationId === applicationId).map((event) => ({ ...event }));
  }
}
