import type { ProjectRecord } from './project.types';

/**
 * projects 저장소 인터페이스.
 *
 * 원본에서는 이 인터페이스가 `prototype/mock/project.mock.ts` 안에 Mock 구현과 같이 있었다.
 * app/ 에서는 인터페이스와 구현을 분리한다 — Prisma 스키마가 채워지면
 * `in-memory-project.repository.ts` 자리에 Prisma 구현을 끼우고 서비스는 손대지 않는다
 * (app/server/AGENTS.md, user-management 의 auth.repository.ts 와 같은 배치).
 *
 * 2026-09-08 팀장 반영: Prisma 백엔드 추가를 위해 전 메서드를 Promise 반환으로 바꿨다 —
 * InMemory 구현은 계산한 값을 Promise.resolve로 감싸기만 하면 되고, 호출부(project.service.ts·
 * project-contract.service.ts)는 원래 동기였던 함수(mustFind·listProjects·getProject·
 * updateProject·deleteProject·listMyProjects·reopenRecruitment)를 전부 async로 바꿔
 * await를 추가했다 — 그에 맞춰 project.controller.ts의 대응 핸들러도 async로 바꿨다.
 */
export interface ProjectRepository {
  /** 소프트 삭제된 것도 준다. 삭제 판정은 서비스가 한다 */
  findByIdIncludingDeleted(projectId: string): Promise<ProjectRecord | null>;
  /** 삭제된 것은 제외한다 (규칙 11) */
  findById(projectId: string): Promise<ProjectRecord | null>;
  findAll(): Promise<ProjectRecord[]>;
  findByClientId(clientId: string): Promise<ProjectRecord[]>;
  insert(record: ProjectRecord): Promise<ProjectRecord>;
  /** 필드를 부분 갱신한다. updatedAt 은 자동으로 찍는다 */
  update(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord>;

  /* 멱등 처리 — 같은 요청이 두 번 와도 한 번만 처리한다 (규칙 43) */
  findProcessed(idempotencyKey: string): Promise<ProcessedRecord | null>;
  markProcessed(idempotencyKey: string, result: unknown, projectVersion: number): Promise<ProcessedRecord>;
}

export type ProcessedRecord = {
  idempotencyKey: string;
  processedAt: string;
  result: unknown;
  projectVersion: number;
};
