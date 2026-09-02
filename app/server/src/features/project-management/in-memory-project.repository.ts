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

  findByIdIncludingDeleted(projectId: string): ProjectRecord | null {
    return this.rows.get(projectId) ?? null;
  }

  findById(projectId: string): ProjectRecord | null {
    const row = this.rows.get(projectId);
    if (!row || row.deletedAt !== null) return null;
    return row;
  }

  findAll(): ProjectRecord[] {
    return [...this.rows.values()].filter((p) => p.deletedAt === null);
  }

  findByClientId(clientId: string): ProjectRecord[] {
    return [...this.rows.values()].filter((p) => p.deletedAt === null && p.clientId === clientId);
  }

  insert(record: ProjectRecord): ProjectRecord {
    if (this.rows.has(record.projectId)) {
      throw new Error(`projectId 중복 — ${record.projectId}`);
    }
    this.rows.set(record.projectId, record);
    return record;
  }

  update(projectId: string, patch: Partial<ProjectRecord>): ProjectRecord {
    const row = this.rows.get(projectId);
    if (!row) throw new Error(`없는 projectId — ${projectId}`);
    const next: ProjectRecord = { ...row, ...patch, updatedAt: this.now() };
    this.rows.set(projectId, next);
    return next;
  }

  findProcessed(idempotencyKey: string): ProcessedRecord | null {
    return this.processed.get(idempotencyKey) ?? null;
  }

  markProcessed(idempotencyKey: string, result: unknown, projectVersion: number): ProcessedRecord {
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
