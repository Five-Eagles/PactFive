/**
 * projects 저장소 Mock
 *
 * 실제 DB 가 없는 동안 `project.repository.ts` 자리를 대신한다.
 * 서비스 코드는 이 Mock 을 직접 부르지 않고 `ProjectRepository` 인터페이스만 본다 —
 * 실제 Prisma 구현이 나오면 이 파일만 갈아끼운다.
 *
 * 호출할 때마다 새 저장소를 준다. 테스트끼리 상태가 새면 순서에 따라 결과가 달라진다.
 * contracts-payments Mock 도 같은 방식이다.
 */

import type { ProjectRecord } from "../server/project.types";
import { cloneSeeds } from "./seeds";

/* ─────────────── 저장소 인터페이스 ─────────────── */

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

/* ─────────────── 구현 ─────────────── */

export type MockClock = { now(): string };

/** 테스트에서 시간을 고정할 수 있게 시계를 주입받는다 */
export const systemClock: MockClock = {
  now: () => new Date().toISOString(),
};

export function createFixedClock(iso: string): MockClock {
  return { now: () => iso };
}

export function createProjectRepositoryMock(
  clock: MockClock = systemClock,
  seeds: ProjectRecord[] = cloneSeeds(),
): ProjectRepository {
  const rows = new Map<string, ProjectRecord>(seeds.map((p) => [p.projectId, p]));
  const processed = new Map<string, ProcessedRecord>();

  return {
    findByIdIncludingDeleted(projectId) {
      return rows.get(projectId) ?? null;
    },

    findById(projectId) {
      const row = rows.get(projectId);
      if (!row || row.deletedAt !== null) return null;
      return row;
    },

    findAll() {
      return [...rows.values()].filter((p) => p.deletedAt === null);
    },

    findByClientId(clientId) {
      return [...rows.values()].filter((p) => p.deletedAt === null && p.clientId === clientId);
    },

    insert(record) {
      if (rows.has(record.projectId)) {
        throw new Error(`Mock: projectId 중복 — ${record.projectId}`);
      }
      rows.set(record.projectId, record);
      return record;
    },

    update(projectId, patch) {
      const row = rows.get(projectId);
      if (!row) throw new Error(`Mock: 없는 projectId — ${projectId}`);
      const next: ProjectRecord = { ...row, ...patch, updatedAt: clock.now() };
      rows.set(projectId, next);
      return next;
    },

    findProcessed(idempotencyKey) {
      return processed.get(idempotencyKey) ?? null;
    },

    markProcessed(idempotencyKey, result, projectVersion) {
      const rec: ProcessedRecord = {
        idempotencyKey,
        processedAt: clock.now(),
        result,
        projectVersion,
      };
      processed.set(idempotencyKey, rec);
      return rec;
    },
  };
}

/* ─────────────── 참조 데이터 ─────────────── */

/**
 * 카테고리 6종 · 기술 32종은 오민혁 도메인이 정본이다 (PRD D-12).
 * 검증에 필요한 최소한만 여기 둔다 — 실제로는 skills 테이블을 읽는다.
 */
export const VALID_CATEGORIES = [
  "WEB_DEVELOPMENT",
  "MOBILE_APP",
  "DESIGN",
  "DATA_AI",
  "PLANNING",
  "MARKETING",
] as const;

/** is_custom = false 인 공식 기술만. 커스텀이 섞이면 422 (규칙 5) */
export const OFFICIAL_SKILLS = [
  "REACT", "NODEJS", "SQL", "TYPESCRIPT", "JAVASCRIPT", "VUE",
  "SPRING", "FIGMA", "FLUTTER", "PYTHON", "HTML_CSS", "AWS",
] as const;

/** 프리랜서가 직접 만든 기술. 프로젝트 요구 기술에 넣을 수 없다 (PRD D-64) */
export const CUSTOM_SKILLS = ["MY_OWN_STACK", "SOME_CUSTOM_TOOL"] as const;

export function isOfficialSkill(skillId: string): boolean {
  return (OFFICIAL_SKILLS as readonly string[]).includes(skillId);
}

export function isKnownSkill(skillId: string): boolean {
  return isOfficialSkill(skillId) || (CUSTOM_SKILLS as readonly string[]).includes(skillId);
}

export function isValidCategory(category: string): boolean {
  return (VALID_CATEGORIES as readonly string[]).includes(category);
}
