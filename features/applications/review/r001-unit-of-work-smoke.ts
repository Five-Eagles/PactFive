/**
 * R-001 — unitOfWork 경로: bump 실패 시 publish가 나가지 않고, 성공 시 순서가 맞는지.
 * 실행: npx tsx features/applications/review/r001-unit-of-work-smoke.ts
 */
import assert from 'node:assert/strict';
import { createApplication } from '../../../app/server/src/features/applications/application.service';
import type {
  ApplicationRepository,
  ApplicationUnitOfWork,
  ApplicationWriteTx,
  ProjectApplicationContextPort,
} from '../../../app/server/src/features/applications/application.types';

const project: Awaited<ReturnType<ProjectApplicationContextPort['getProjectContext']>> = {
  projectId: 'prj_r001',
  clientId: 'usr_client',
  title: 'R001',
  recruitmentStatus: 'OPEN',
  transactionStatus: 'NONE',
  acceptedApplicationId: null,
  recruitmentDeadlineAt: null,
};

function baseRepo(): ApplicationRepository {
  return {
    getApplication: async () => undefined,
    getByProject: async () => [],
    getByFreelancer: async () => [],
    findByProjectFreelancer: async () => undefined,
    insertApplication: async () => {
      throw new Error('should use unitOfWork');
    },
    saveApplication: async () => undefined,
    getIdempotency: async () => undefined,
    setIdempotency: async () => undefined,
    getClosure: async () => undefined,
    setClosure: async () => undefined,
    nextApplicationId: async () => 'app_r001',
    nextOperationId: async () => 'op_r001',
    saveOperation: async () => undefined,
    getOperation: async () => undefined,
    getOperations: async () => [],
    listQueuedOperations: async () => [],
    appendStateEvent: async () => undefined,
    getStateEvents: async () => [],
  };
}

async function main() {
  const ops: string[] = [];
  let published = 0;

  const okUow: ApplicationUnitOfWork = {
    async run(fn) {
      const tx: ApplicationWriteTx = {
        insertApplication: async () => {
          ops.push('insert');
        },
        saveApplication: async () => undefined,
        appendStateEvent: async () => {
          ops.push('transition');
        },
        setIdempotency: async () => {
          ops.push('idem');
        },
        bumpApplicationCounts: async () => {
          ops.push('bump');
          return { applicationCount: 1, pendingApplicationCount: 1 };
        },
      };
      return fn(tx);
    },
  };

  await createApplication(
    {
      repository: baseRepo(),
      projectContext: {
        getProjectContext: async () => project,
        bumpApplicationCounts: async () => {
          throw new Error('port bump should not run when UoW present');
        },
      },
      notifications: {
        publish: async () => {
          published += 1;
        },
      },
      projectApplications: { acceptProjectApplication: async () => ({}) as never },
      now: () => '2026-09-20T00:00:00.000Z',
      nextRequestId: () => 'req',
      unitOfWork: okUow,
    },
    'prj_r001',
    'usr_free',
    { coverLetter: '가'.repeat(100), expectedAmount: 10000, expectedDurationDays: 10 },
    'idem-ok',
    'FREELANCER',
  );
  assert.deepEqual(ops, ['insert', 'transition', 'bump', 'idem']);
  assert.equal(published, 1);

  ops.length = 0;
  published = 0;
  const failUow: ApplicationUnitOfWork = {
    async run(fn) {
      const tx: ApplicationWriteTx = {
        insertApplication: async () => {
          ops.push('insert');
        },
        saveApplication: async () => undefined,
        appendStateEvent: async () => {
          ops.push('transition');
        },
        setIdempotency: async () => {
          ops.push('idem');
        },
        bumpApplicationCounts: async () => {
          ops.push('bump-fail');
          throw new Error('bump failed');
        },
      };
      return fn(tx);
    },
  };

  await assert.rejects(
    () =>
      createApplication(
        {
          repository: baseRepo(),
          projectContext: {
            getProjectContext: async () => project,
            bumpApplicationCounts: async () => ({ applicationCount: 0, pendingApplicationCount: 0 }),
          },
          notifications: {
            publish: async () => {
              published += 1;
            },
          },
          projectApplications: { acceptProjectApplication: async () => ({}) as never },
          now: () => '2026-09-20T00:00:00.000Z',
          nextRequestId: () => 'req',
          unitOfWork: failUow,
        },
        'prj_r001',
        'usr_free',
        { coverLetter: '가'.repeat(100), expectedAmount: 10000, expectedDurationDays: 10 },
        'idem-fail',
        'FREELANCER',
      ),
    /bump failed/,
  );
  assert.equal(published, 0, 'publish must not run after tx failure');
  assert.ok(ops.includes('insert') && ops.includes('bump-fail'));
  console.log('PASS R-001 unitOfWork ordering + publish-after-commit');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
