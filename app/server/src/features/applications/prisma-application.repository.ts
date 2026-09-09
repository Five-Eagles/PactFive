import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  PrismaClient,
  Application as ApplicationRowModel,
  ApplicationOperation as ApplicationOperationModel,
  ApplicationOperationStep as ApplicationOperationStepModel,
} from '../../generated/prisma/client';
import type {
  ApplicationOperation,
  ApplicationRepository,
  ApplicationRow,
  ApplicationStateEvent,
  ApplicationStatus,
  IdempotencyRecord,
  OperationStatus,
  OperationStepName,
  OperationStepStatus,
  OperationType,
  RejectPendingApplicationsResult,
} from './application.types';

type OperationWithSteps = ApplicationOperationModel & { steps: ApplicationOperationStepModel[] };

/**
 * ApplicationRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryApplicationRepository와 동작을
 * 최대한 동일하게 맞췄다. 두 가지만 구조가 다르다:
 *
 * 1. `ApplicationOperation.steps`는 원본(in-memory)에서 operation 객체 안의 배열이지만,
 *    schema.prisma에서는 `ApplicationOperationStep` 자식 테이블로 정규화했다(PRISMA-GAP-13,
 *    팀장이 스키마 반영 시 내린 판단 — 데이터 의미는 원본과 동일). `saveOperation`은 항상
 *    "다음 상태의 전체 steps 배열"을 받으므로(operation.service.ts가 매번 배열 전체를
 *    다시 만들어 넘긴다), 전량 삭제 후 seq 순서대로 재삽입한다. `getOperation`/`getOperations`/
 *    `listQueuedOperations`는 `seq` 오름차순으로 정렬해 배열로 되돌린다.
 * 2. `type`/`status`/`name`은 schema.prisma에서 Prisma enum이 아니라 VarChar다(원본 코드의
 *    리터럴 유니온을 그대로 옮겼다 — PRISMA-GAP-11~15 주석) — 그래서 Prisma가 돌려주는
 *    `string`을 도메인 리터럴 유니온으로 캐스팅해서 쓴다.
 */
export class PrismaApplicationRepository implements ApplicationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getApplication(applicationId: string): Promise<ApplicationRow | undefined> {
    const row = await this.prisma.application.findUnique({ where: { id: applicationId } });
    return row ? toApplicationRow(row) : undefined;
  }

  async getByProject(projectId: string): Promise<ApplicationRow[]> {
    const rows = await this.prisma.application.findMany({ where: { projectId } });
    return rows.map(toApplicationRow);
  }

  async getByFreelancer(freelancerId: string): Promise<ApplicationRow[]> {
    const rows = await this.prisma.application.findMany({ where: { freelancerId } });
    return rows.map(toApplicationRow);
  }

  async findByProjectFreelancer(projectId: string, freelancerId: string): Promise<ApplicationRow | undefined> {
    const row = await this.prisma.application.findUnique({
      where: { uq_applications_once: { projectId, freelancerId } },
    });
    return row ? toApplicationRow(row) : undefined;
  }

  async insertApplication(row: ApplicationRow): Promise<void> {
    await this.prisma.application.create({
      data: {
        id: row.applicationId,
        projectId: row.projectId,
        freelancerId: row.freelancerId,
        coverLetter: row.coverLetter,
        expectedAmount: row.expectedAmount,
        expectedDurationDays: row.expectedDurationDays,
        status: row.status,
        rejectionType: row.rejectionType,
        decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
        createdAt: new Date(row.createdAt),
      },
    });
  }

  async saveApplication(row: ApplicationRow): Promise<void> {
    await this.prisma.application.update({
      where: { id: row.applicationId },
      data: {
        status: row.status,
        rejectionType: row.rejectionType,
        decidedAt: row.decidedAt ? new Date(row.decidedAt) : null,
      },
    });
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | undefined> {
    const row = await this.prisma.applicationIdempotencyKey.findUnique({ where: { key } });
    if (!row) return undefined;
    return { bodyHash: row.bodyHash, applicationId: row.applicationId, operationId: row.operationId ?? undefined };
  }

  async setIdempotency(key: string, bodyHash: string, applicationId: string, operationId?: string): Promise<void> {
    await this.prisma.applicationIdempotencyKey.upsert({
      where: { key },
      create: { key, bodyHash, applicationId, operationId },
      update: { bodyHash, applicationId, operationId },
    });
  }

  async getClosure(closureEventId: string): Promise<RejectPendingApplicationsResult | undefined> {
    const row = await this.prisma.applicationClosure.findUnique({ where: { closureEventId } });
    if (!row) return undefined;
    return {
      rejectedCount: row.rejectedCount,
      alreadyProcessed: row.alreadyProcessed,
      result: row.result as RejectPendingApplicationsResult['result'],
    };
  }

  async setClosure(closureEventId: string, result: RejectPendingApplicationsResult): Promise<void> {
    await this.prisma.applicationClosure.upsert({
      where: { closureEventId },
      create: {
        closureEventId,
        rejectedCount: result.rejectedCount,
        alreadyProcessed: result.alreadyProcessed,
        result: result as unknown as Prisma.InputJsonValue,
      },
      update: {
        rejectedCount: result.rejectedCount,
        alreadyProcessed: result.alreadyProcessed,
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async nextApplicationId(): Promise<string> {
    return `app_${randomUUID().replace(/-/g, '')}`;
  }

  async nextOperationId(): Promise<string> {
    return `appop_${randomUUID().replace(/-/g, '')}`;
  }

  async saveOperation(row: ApplicationOperation): Promise<void> {
    await this.prisma.applicationOperation.upsert({
      where: { id: row.operationId },
      create: {
        id: row.operationId,
        applicationId: row.applicationId,
        projectId: row.projectId,
        clientId: row.clientId,
        type: row.type,
        status: row.status,
        updatedAt: new Date(row.updatedAt),
        retryAfterSeconds: row.retryAfterSeconds,
        requiresOperatorAction: row.requiresOperatorAction,
        leaseUntil: row.leaseUntil ? new Date(row.leaseUntil) : null,
        attempts: row.attempts,
        steps: {
          create: row.steps.map((step, index) => ({
            id: `aos_${randomUUID().replace(/-/g, '')}`,
            seq: index,
            name: step.name,
            status: step.status,
            reason: step.reason,
          })),
        },
      },
      update: {
        type: row.type,
        status: row.status,
        updatedAt: new Date(row.updatedAt),
        retryAfterSeconds: row.retryAfterSeconds,
        requiresOperatorAction: row.requiresOperatorAction,
        leaseUntil: row.leaseUntil ? new Date(row.leaseUntil) : null,
        attempts: row.attempts,
        steps: {
          deleteMany: {},
          create: row.steps.map((step, index) => ({
            id: `aos_${randomUUID().replace(/-/g, '')}`,
            seq: index,
            name: step.name,
            status: step.status,
            reason: step.reason,
          })),
        },
      },
    });
  }

  async getOperation(operationId: string): Promise<ApplicationOperation | undefined> {
    const row = await this.prisma.applicationOperation.findUnique({
      where: { id: operationId },
      include: { steps: { orderBy: { seq: 'asc' } } },
    });
    return row ? toOperation(row) : undefined;
  }

  async getOperations(): Promise<ApplicationOperation[]> {
    const rows = await this.prisma.applicationOperation.findMany({
      include: { steps: { orderBy: { seq: 'asc' } } },
    });
    return rows.map(toOperation);
  }

  async listQueuedOperations(): Promise<ApplicationOperation[]> {
    const rows = await this.prisma.applicationOperation.findMany({
      where: { status: 'QUEUED' },
      include: { steps: { orderBy: { seq: 'asc' } } },
    });
    return rows.map(toOperation);
  }

  async appendStateEvent(event: ApplicationStateEvent): Promise<void> {
    await this.prisma.applicationStateEvent.create({
      data: {
        id: `apse_${randomUUID().replace(/-/g, '')}`,
        applicationId: event.applicationId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        rejectionType: event.rejectionType,
        occurredAt: new Date(event.at),
      },
    });
  }

  async getStateEvents(applicationId: string): Promise<ApplicationStateEvent[]> {
    const rows = await this.prisma.applicationStateEvent.findMany({
      where: { applicationId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((row) => ({
      applicationId: row.applicationId,
      fromStatus: row.fromStatus as ApplicationStatus | null,
      toStatus: row.toStatus as ApplicationStatus,
      rejectionType: row.rejectionType,
      at: row.occurredAt.toISOString(),
    }));
  }
}

function toApplicationRow(row: ApplicationRowModel): ApplicationRow {
  return {
    applicationId: row.id,
    projectId: row.projectId,
    freelancerId: row.freelancerId,
    coverLetter: row.coverLetter,
    expectedAmount: row.expectedAmount,
    expectedDurationDays: row.expectedDurationDays,
    status: row.status as ApplicationStatus,
    rejectionType: row.rejectionType,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOperation(row: OperationWithSteps): ApplicationOperation {
  return {
    operationId: row.id,
    applicationId: row.applicationId,
    projectId: row.projectId,
    clientId: row.clientId,
    type: row.type as OperationType,
    status: row.status as OperationStatus,
    steps: row.steps
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((step) => ({
        name: step.name as OperationStepName,
        status: step.status as OperationStepStatus,
        reason: step.reason,
      })),
    updatedAt: row.updatedAt.toISOString(),
    retryAfterSeconds: row.retryAfterSeconds,
    requiresOperatorAction: row.requiresOperatorAction,
    leaseUntil: row.leaseUntil ? row.leaseUntil.toISOString() : null,
    attempts: row.attempts,
  };
}
