import type {
  ProjectTransactionCallLogEntry,
  ProjectTransactionCallLogRepository,
} from './project-transaction.repository';

/**
 * `ProjectTransactionCallLogRepository`의 인메모리 구현. `app/server/prisma/schema.prisma`가
 * 채워지기 전까지 쓴다(app/AGENTS.md — prisma 스키마는 팀장 전담 영역, 현재 비어 있음).
 */
export class InMemoryProjectTransactionCallLogRepository implements ProjectTransactionCallLogRepository {
  private readonly entries = new Map<string, ProjectTransactionCallLogEntry>();

  async record(entry: ProjectTransactionCallLogEntry): Promise<void> {
    this.entries.set(entry.idempotencyKey, { ...entry });
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<ProjectTransactionCallLogEntry | null> {
    const found = this.entries.get(idempotencyKey);
    return found ? { ...found } : null;
  }
}
