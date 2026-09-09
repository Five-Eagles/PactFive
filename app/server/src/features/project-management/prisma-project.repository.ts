import type { Prisma, PrismaClient, Project as ProjectRow, ProjectSkill as ProjectSkillRow } from '../../generated/prisma/client';
import type { ProcessedRecord, ProjectRepository } from './project.repository';
import type { ProjectRecord } from './project.types';

type ProjectWithSkills = ProjectRow & { projectSkills: ProjectSkillRow[] };

/**
 * ProjectRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryProjectRepository와 동작을 최대한
 * 동일하게 맞췄다 — `skillIds`는 ERD상 `project_skills` 조인 테이블이라, `insert`/`update`에서
 * 항상 `projectSkills` 관계를 같이 갱신한다(스킬 목록이 patch에 있으면 전량 삭제 후 재삽입 —
 * project.service.ts가 항상 "다음 상태의 전체 목록"을 넘기지, 증분 diff를 넘기지 않는다).
 *
 * `findProcessed`/`markProcessed`는 오늘(2026-09-08) 신설한 `project_contract_idempotency_records`
 * 테이블(PRISMA-GAP-16, E-46)을 쓴다 — 원본(유동우, project-contract.service.ts) 그대로.
 */
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdIncludingDeleted(projectId: string): Promise<ProjectRecord | null> {
    const row = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { projectSkills: true },
    });
    return row ? toProjectRecord(row) : null;
  }

  async findById(projectId: string): Promise<ProjectRecord | null> {
    const row = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { projectSkills: true },
    });
    return row ? toProjectRecord(row) : null;
  }

  async findAll(): Promise<ProjectRecord[]> {
    const rows = await this.prisma.project.findMany({
      where: { deletedAt: null },
      include: { projectSkills: true },
    });
    return rows.map(toProjectRecord);
  }

  async findByClientId(clientId: string): Promise<ProjectRecord[]> {
    const rows = await this.prisma.project.findMany({
      where: { clientId, deletedAt: null },
      include: { projectSkills: true },
    });
    return rows.map(toProjectRecord);
  }

  async insert(record: ProjectRecord): Promise<ProjectRecord> {
    const row = await this.prisma.project.create({
      data: {
        id: record.projectId,
        clientId: record.clientId,
        title: record.title,
        description: record.description,
        category: record.category as Prisma.ProjectCreateInput['category'],
        budgetAmount: record.budgetAmount,
        budgetSource: record.budgetSource,
        budgetSourceAt: new Date(record.budgetSourceAt),
        recruitmentStartAt: record.recruitmentStartAt ? new Date(record.recruitmentStartAt) : null,
        recruitmentDeadlineAt: new Date(record.recruitmentDeadlineAt),
        recruitmentStatus: record.recruitmentStatus,
        transactionStatus: record.transactionStatus,
        applicationCount: record.applicationCount,
        pendingApplicationCount: record.pendingApplicationCount,
        recruitmentClosedAt: record.recruitmentClosedAt ? new Date(record.recruitmentClosedAt) : null,
        canceledAt: record.canceledAt ? new Date(record.canceledAt) : null,
        deadlineNotifiedAt: record.deadlineNotifiedAt ? new Date(record.deadlineNotifiedAt) : null,
        acceptedApplicationId: record.acceptedApplicationId,
        paymentPendingAt: record.paymentPendingAt ? new Date(record.paymentPendingAt) : null,
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
        projectVersion: record.projectVersion,
        createdAt: new Date(record.createdAt),
        deletedAt: record.deletedAt ? new Date(record.deletedAt) : null,
        projectSkills: {
          create: record.skillIds.map((skillId) => ({ skillId, createdAt: new Date(record.createdAt) })),
        },
      },
      include: { projectSkills: true },
    });
    return toProjectRecord(row);
  }

  async update(projectId: string, patch: Partial<ProjectRecord>): Promise<ProjectRecord> {
    const { skillIds, ...rest } = patch;
    const data: Prisma.ProjectUpdateInput = toScalarData(rest);
    if (skillIds !== undefined) {
      // 원본(in-memory)과 마찬가지로 "다음 상태의 전체 목록"을 받는다 — 증분이 아니다.
      // 전량 삭제 후 재삽입해 항상 patch가 곧 정답이 되게 한다.
      data.projectSkills = {
        deleteMany: {},
        create: skillIds.map((skillId) => ({ skillId, createdAt: new Date() })),
      };
    }
    const row = await this.prisma.project.update({
      where: { id: projectId },
      data,
      include: { projectSkills: true },
    });
    return toProjectRecord(row);
  }

  async findProcessed(idempotencyKey: string): Promise<ProcessedRecord | null> {
    const row = await this.prisma.projectContractIdempotencyRecord.findUnique({
      where: { idempotencyKey },
    });
    return row
      ? {
          idempotencyKey: row.idempotencyKey,
          processedAt: row.processedAt.toISOString(),
          result: row.result,
          projectVersion: row.projectVersion,
        }
      : null;
  }

  async markProcessed(idempotencyKey: string, result: unknown, projectVersion: number): Promise<ProcessedRecord> {
    const processedAt = new Date();
    const row = await this.prisma.projectContractIdempotencyRecord.upsert({
      where: { idempotencyKey },
      create: { idempotencyKey, processedAt, result: result as Prisma.InputJsonValue, projectVersion },
      update: { processedAt, result: result as Prisma.InputJsonValue, projectVersion },
    });
    return {
      idempotencyKey: row.idempotencyKey,
      processedAt: row.processedAt.toISOString(),
      result: row.result,
      projectVersion: row.projectVersion,
    };
  }
}

/** ProjectRecord의 스칼라 필드만 Prisma 입력 형태로 옮긴다 (skillIds·projectId 제외). */
function toScalarData(patch: Partial<ProjectRecord>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (patch.clientId !== undefined) data.clientId = patch.clientId;
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.category !== undefined) data.category = patch.category;
  if (patch.budgetAmount !== undefined) data.budgetAmount = patch.budgetAmount;
  if (patch.budgetSource !== undefined) data.budgetSource = patch.budgetSource;
  if (patch.budgetSourceAt !== undefined) data.budgetSourceAt = new Date(patch.budgetSourceAt);
  if (patch.recruitmentStartAt !== undefined) {
    data.recruitmentStartAt = patch.recruitmentStartAt ? new Date(patch.recruitmentStartAt) : null;
  }
  if (patch.recruitmentDeadlineAt !== undefined) data.recruitmentDeadlineAt = new Date(patch.recruitmentDeadlineAt);
  if (patch.recruitmentStatus !== undefined) data.recruitmentStatus = patch.recruitmentStatus;
  if (patch.transactionStatus !== undefined) data.transactionStatus = patch.transactionStatus;
  if (patch.applicationCount !== undefined) data.applicationCount = patch.applicationCount;
  if (patch.pendingApplicationCount !== undefined) data.pendingApplicationCount = patch.pendingApplicationCount;
  if (patch.recruitmentClosedAt !== undefined) {
    data.recruitmentClosedAt = patch.recruitmentClosedAt ? new Date(patch.recruitmentClosedAt) : null;
  }
  if (patch.canceledAt !== undefined) data.canceledAt = patch.canceledAt ? new Date(patch.canceledAt) : null;
  if (patch.deadlineNotifiedAt !== undefined) {
    data.deadlineNotifiedAt = patch.deadlineNotifiedAt ? new Date(patch.deadlineNotifiedAt) : null;
  }
  if (patch.acceptedApplicationId !== undefined) data.acceptedApplicationId = patch.acceptedApplicationId;
  if (patch.paymentPendingAt !== undefined) {
    data.paymentPendingAt = patch.paymentPendingAt ? new Date(patch.paymentPendingAt) : null;
  }
  if (patch.completedAt !== undefined) {
    data.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
  }
  if (patch.projectVersion !== undefined) data.projectVersion = patch.projectVersion;
  if (patch.createdAt !== undefined) data.createdAt = new Date(patch.createdAt);
  if (patch.deletedAt !== undefined) data.deletedAt = patch.deletedAt ? new Date(patch.deletedAt) : null;
  // updatedAt은 InMemory와 마찬가지로 @updatedAt이 자동으로 찍는다 — 직접 안 넣는다.
  return data;
}

function toProjectRecord(row: ProjectWithSkills): ProjectRecord {
  return {
    projectId: row.id,
    clientId: row.clientId,
    title: row.title,
    description: row.description,
    category: row.category,
    budgetAmount: row.budgetAmount,
    budgetSource: row.budgetSource,
    budgetSourceAt: row.budgetSourceAt.toISOString(),
    recruitmentStartAt: row.recruitmentStartAt ? row.recruitmentStartAt.toISOString() : null,
    recruitmentDeadlineAt: row.recruitmentDeadlineAt.toISOString(),
    recruitmentStatus: row.recruitmentStatus,
    transactionStatus: row.transactionStatus,
    applicationCount: row.applicationCount,
    pendingApplicationCount: row.pendingApplicationCount,
    recruitmentClosedAt: row.recruitmentClosedAt ? row.recruitmentClosedAt.toISOString() : null,
    canceledAt: row.canceledAt ? row.canceledAt.toISOString() : null,
    deadlineNotifiedAt: row.deadlineNotifiedAt ? row.deadlineNotifiedAt.toISOString() : null,
    acceptedApplicationId: row.acceptedApplicationId,
    paymentPendingAt: row.paymentPendingAt ? row.paymentPendingAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    projectVersion: row.projectVersion,
    skillIds: row.projectSkills.map((s) => s.skillId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}
