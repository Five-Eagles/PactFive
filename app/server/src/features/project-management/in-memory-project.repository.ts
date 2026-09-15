import type { ProcessedRecord, ProjectRepository } from './project.repository';
import type { ProjectRecord } from './project.types';

/**
 * projects 인메모리 저장소.
 *
 * 원본: features/project-management/prototype/mock/project.mock.ts 의 구현부.
 * app/server/prisma/schema.prisma 가 비어 있는 동안 쓰는 잠정 구현이다 —
 * user-management 의 `in-memory-auth.repository.ts`, contracts-payments 의
 * `in-memory-project-transaction-call-log.repository.ts` 와 같은 위치를 차지한다.
 *
 * 서버리스에서는 인스턴스마다 이 Map 이 따로 존재한다 (app/server/AGENTS.md
 * "서버리스 제약"). 실제 데이터는 Prisma 구현으로 교체되기 전까지 신뢰할 수 없다.
 *
 * 2026-09-08 팀장 반영: ProjectRepository가 Promise 반환으로 바뀌면서, 이미 동기로 계산한
 * 값을 Promise.resolve로 감싸기만 했다 — 내부 로직·자료구조는 그대로다.
 */
export class InMemoryProjectRepository implements ProjectRepository {
  private readonly rows = new Map<string, ProjectRecord>();
  private readonly processed = new Map<string, ProcessedRecord>();

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
    seeds: ProjectRecord[] = [],
  ) {
    for (const seed of seeds) this.rows.set(seed.projectId, { ...seed });
  }

  async findByIdIncludingDeleted(projectId: string): Promise<ProjectRecord | null> {
    return this.rows.get(projectId) ?? null;
  }

  async findById(projectId: string): Promise<ProjectRecord | null> {
    const row = this.rows.get(projectId);
    if (!row || row.deletedAt !== null) return null;
    return row;
  }

  async findAll(): Promise<ProjectRecord[]> {
    return [...this.rows.values()].filter((p) => p.deletedAt === null);
  }

  async findByClientId(clientId: string): Promise<ProjectRecord[]> {
    return [...this.rows.values()].filter((p) => p.deletedAt === null && p.clientId === clientId);
  }

  async insert(record: ProjectRecord): Promise<ProjectRecord> {
    if (this.rows.has(record.projectId)) {
      throw new Error(`projectId 중복 — ${record.projectId}`);
    }
    this.rows.set(record.projectId, record);
    return record;
  }

  async update(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const row = this.rows.get(projectId);
    if (!row) throw new Error(`없는 projectId — ${projectId}`);
    const next: ProjectRecord = { ...row, ...patch, updatedAt: this.now() };
    this.rows.set(projectId, next);
    return next;
  }

  async findProcessed(idempotencyKey: string): Promise<ProcessedRecord | null> {
    return this.processed.get(idempotencyKey) ?? null;
  }

  async markProcessed(idempotencyKey: string, result: unknown, projectVersion: number): Promise<ProcessedRecord> {
    const record: ProcessedRecord = {
      idempotencyKey,
      processedAt: this.now(),
      result,
      projectVersion,
    };
    this.processed.set(idempotencyKey, record);
    return record;
  }
}
