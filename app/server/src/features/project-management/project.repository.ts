import type { ProjectRecord } from './project.types';

/**
 * projects 저장소 인터페이스.
 *
 * 원본에서는 이 인터페이스가 `prototype/mock/project.mock.ts` 안에 Mock 구현과 같이 있었다.
 * app/ 에서는 인터페이스와 구현을 분리한다 — Prisma 스키마가 채워지면
 * `in-memory-project.repository.ts` 자리에 Prisma 구현을 끼우고 서비스는 손대지 않는다
 * (app/server/AGENTS.md, user-management 의 auth.repository.ts 와 같은 배치).
 */
export interface ProjectRepository {
  /** 소프트 삭제된 것도 준다. 삭제 판정은 서비스가 한다 */
  findByIdIncludingDeleted(projectId: string): ProjectRecord | null;
  /** 삭제된 것은 제외한다 (규칙 11) */
  findById(projectId: string): ProjectRecord | null;
  findAll(): ProjectRecord[];
  findByClientId(clientId: string): ProjectRecord[];
  insert(record: ProjectRecord): ProjectRecord;
  /** 필드를 부분 갱신한다. updatedAt 은 자동으로 찍는다 */
  update(projectId: string, patch: Partial<ProjectRecord>): ProjectRecord;

  /* 멱등 처리 — 같은 요청이 두 번 와도 한 번만 처리한다 (규칙 43) */
  findProcessed(idempotencyKey: string): ProcessedRecord | null;
  markProcessed(idempotencyKey: string, result: unknown, projectVersion: number): ProcessedRecord;
}

export type ProcessedRecord = {
  idempotencyKey: string;
  processedAt: string;
  result: unknown;
  projectVersion: number;
};
