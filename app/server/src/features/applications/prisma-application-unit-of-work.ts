import type { PrismaClient } from '../../generated/prisma/client';
import { PrismaApplicationRepository } from './prisma-application.repository';
import { PrismaProjectRepository } from '../project-management/prisma-project.repository';
import type {
  ApplicationRow,
  ApplicationStateEvent,
  ApplicationUnitOfWork,
  ApplicationWriteTx,
} from './application.types';

/**
 * R-001 — applications 쓰기와 projects 건수 bump를 같은 Prisma `$transaction`에 묶는다.
 * 알림 publish는 서비스가 트랜잭션 밖에서 호출한다(ADR-0015).
 */
export function createPrismaApplicationUnitOfWork(prisma: PrismaClient): ApplicationUnitOfWork {
  return {
    async run<T>(fn: (tx: ApplicationWriteTx) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (client) => {
        // TransactionClient는 모델 API가 PrismaClient와 호환된다.
        const txClient = client as unknown as PrismaClient;
        const appRepo = new PrismaApplicationRepository(txClient);
        const projectRepo = new PrismaProjectRepository(txClient);
        const writeTx: ApplicationWriteTx = {
          insertApplication: (row: ApplicationRow) => appRepo.insertApplication(row),
          saveApplication: (row: ApplicationRow) => appRepo.saveApplication(row),
          appendStateEvent: (event: ApplicationStateEvent) => appRepo.appendStateEvent(event),
          setIdempotency: (key, bodyHash, applicationId, operationId) =>
            appRepo.setIdempotency(key, bodyHash, applicationId, operationId),
          async bumpApplicationCounts(projectId, delta) {
            // project-contract.service bumpApplicationCounts와 같은 바닥 0 규칙(CR-AP-001).
            const p = await projectRepo.findById(projectId);
            if (!p) {
              throw new Error(`PROJECT_NOT_FOUND:${projectId}`);
            }
            const updated = await projectRepo.update(projectId, {
              applicationCount: Math.max(0, p.applicationCount + (delta.applicationCount ?? 0)),
              pendingApplicationCount: Math.max(
                0,
                p.pendingApplicationCount + (delta.pendingApplicationCount ?? 0),
              ),
            });
            return {
              applicationCount: updated.applicationCount,
              pendingApplicationCount: updated.pendingApplicationCount,
            };
          },
        };
        return fn(writeTx);
      });
    },
  };
}
