import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeadlineSweepService } from '../src/features/project-management/deadline-sweep.service';
import type { ProjectRecord } from '../src/features/project-management/project.types';

/**
 * 마감 스윕 (notifications CR-0001 §4).
 *
 * 서버를 띄우지 않고 시각을 직접 넣어 확인한다 — 마감이 지난 상황은 실제 서버에서는
 * 기다려야만 만들 수 있다.
 */

const NOW = '2026-09-09T12:00:00.000Z';
const PAST = '2026-09-08T00:00:00.000Z';
const FUTURE = '2026-09-20T00:00:00.000Z';

function project(over: Partial<ProjectRecord>): ProjectRecord {
  return {
    projectId: 'prj_x',
    clientId: 'usr_client_a',
    title: '제목',
    description: '설명',
    category: 'WEB_DEVELOPMENT',
    skillIds: ['HTML_CSS'],
    budgetAmount: 1_000_000,
    budgetSource: 'CLIENT_INPUT',
    recruitmentStartAt: null,
    recruitmentDeadlineAt: FUTURE,
    recruitmentStatus: 'OPEN',
    transactionStatus: 'NONE',
    applicationCount: 0,
    pendingApplicationCount: 0,
    recruitmentClosedAt: null,
    canceledAt: null,
    deadlineNotifiedAt: null,
    acceptedApplicationId: null,
    paymentPendingAt: null,
    projectVersion: 1,
    createdAt: PAST,
    updatedAt: PAST,
    deletedAt: null,
    ...over,
  } as ProjectRecord;
}

function setup(rows: ProjectRecord[]) {
  const closed: { projectId: string; actorUserId: string | undefined }[] = [];
  const svc = createDeadlineSweepService({
    repo: { findAll: async () => rows } as never,
    closer: {
      async closeRecruitment(auth, projectId) {
        closed.push({ projectId, actorUserId: auth?.userId });
        return { status: 200, body: { rejectedApplicationCount: 2 } };
      },
    },
    now: () => NOW,
  });
  return { svc, closed };
}

test('마감 시각이 지난 것만 처리한다', async () => {
  const { svc, closed } = setup([
    project({ projectId: 'prj_due', recruitmentDeadlineAt: PAST }),
    project({ projectId: 'prj_future', recruitmentDeadlineAt: FUTURE }),
  ]);
  const result = await svc.sweepDeadlines();

  assert.equal(result.scanned, 2);
  assert.equal(result.due, 1);
  assert.equal(result.closed, 1);
  assert.deepEqual(
    closed.map((c) => c.projectId),
    ['prj_due'],
  );
});

test('이미 CLOSED 인 것은 다시 처리하지 않는다', async () => {
  const { svc, closed } = setup([
    project({ projectId: 'prj_already', recruitmentDeadlineAt: PAST, recruitmentStatus: 'CLOSED' }),
  ]);
  const result = await svc.sweepDeadlines();

  assert.equal(result.due, 0);
  assert.equal(closed.length, 0);
});

test('모집 시작 전(SCHEDULED)이면 마감일이 지나도 건드리지 않는다', async () => {
  const { svc, closed } = setup([
    project({
      projectId: 'prj_scheduled',
      recruitmentStatus: 'SCHEDULED',
      recruitmentStartAt: FUTURE,
      recruitmentDeadlineAt: PAST,
    }),
  ]);
  const result = await svc.sweepDeadlines();

  assert.equal(result.due, 0, '시작도 안 한 것을 마감하면 안 된다');
  assert.equal(closed.length, 0);
});

test('마감의 주체는 등록 의뢰인 본인이다', async () => {
  const { svc, closed } = setup([
    project({ projectId: 'prj_due', clientId: 'usr_owner', recruitmentDeadlineAt: PAST }),
  ]);
  await svc.sweepDeadlines();

  assert.equal(closed[0]?.actorUserId, 'usr_owner');
});

test('거절된 대기 지원 수를 합산해 돌려준다', async () => {
  const { svc } = setup([
    project({ projectId: 'prj_a', recruitmentDeadlineAt: PAST }),
    project({ projectId: 'prj_b', recruitmentDeadlineAt: PAST }),
  ]);
  const result = await svc.sweepDeadlines();

  assert.equal(result.closed, 2);
  assert.equal(result.rejectedApplications, 4, '건당 2건씩 거절됐다');
});

test('하나가 실패해도 나머지는 계속 처리한다', async () => {
  const attempted: string[] = [];
  const svc = createDeadlineSweepService({
    repo: {
      findAll: async () => [
        project({ projectId: 'prj_bad', recruitmentDeadlineAt: PAST }),
        project({ projectId: 'prj_good', recruitmentDeadlineAt: PAST }),
      ],
    } as never,
    closer: {
      async closeRecruitment(_auth, projectId) {
        attempted.push(projectId);
        if (projectId === 'prj_bad') throw new Error('일부러 낸 오류');
        return { status: 200, body: { rejectedApplicationCount: 0 } };
      },
    },
    now: () => NOW,
  });

  const result = await svc.sweepDeadlines();

  assert.deepEqual(attempted, ['prj_bad', 'prj_good'], '실패 뒤에도 다음 것을 시도한다');
  assert.equal(result.closed, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.projectId, 'prj_bad');
});

test('마감 처리가 4xx 를 주면 실패로 기록하고 넘어간다', async () => {
  const svc = createDeadlineSweepService({
    repo: { findAll: async () => [project({ projectId: 'prj_x', recruitmentDeadlineAt: PAST })] } as never,
    closer: {
      async closeRecruitment() {
        return { status: 409, body: null };
      },
    },
    now: () => NOW,
  });

  const result = await svc.sweepDeadlines();

  assert.equal(result.closed, 0);
  assert.equal(result.failed[0]?.reason, 'status 409');
});
