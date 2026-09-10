/**
 * 재검토 보고서 T01–T31 격리 probe — 로컬 트리(app/server) 기준.
 * 원본 검증 ZIP이 없어 재검토 부록 A + v1.0 appendix C를 로컬 경로/DTO에 맞게 재구성했다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const S = join(ROOT, 'app/server/src/features');

const { InMemoryApplicationRepository } = await import(
  join(S, 'applications/in-memory-application.repository.ts')
);
const { PrismaApplicationRepository } = await import(
  join(S, 'applications/prisma-application.repository.ts')
);
const { createApplication, getApplicationEligibility } = await import(
  join(S, 'applications/application.service.ts')
);
const { createApplicationRouter } = await import(join(S, 'applications/application.router.ts'));
const { InMemoryContractsPaymentsRepository } = await import(
  join(S, 'contracts-payments/in-memory-contracts-payments.repository.ts')
);
const { PrismaContractsPaymentsRepository } = await import(
  join(S, 'contracts-payments/prisma-contracts-payments.repository.ts')
);
const { createPublicApiService, createContractsPaymentsSnapshotReader } = await import(
  join(S, 'contracts-payments/public-api.service.ts')
);
const { createTransactionLifecycleCoordinator } = await import(
  join(S, 'contracts-payments/transaction-lifecycle.coordinator.ts')
);
const { InMemoryReviewRepository } = await import(join(S, 'reviews/in-memory-review.repository.ts'));
const { PrismaReviewRepository } = await import(join(S, 'reviews/prisma-review.repository.ts'));
const {
  createReview,
  isReviewPublic,
  getPublishedRatingAggregate,
  listProjectReviews,
  getUserRating,
} = await import(join(S, 'reviews/review.service.ts'));
const { createReviewRouter } = await import(join(S, 'reviews/review.router.ts'));

const require = createRequire(join(ROOT, 'package.json'));
const express = require('express');

const results = [];
async function test(id, name, fn) {
  try {
    const details = await fn();
    results.push({ id, name, result: 'PASS', details: details ?? '' });
  } catch (e) {
    results.push({ id, name, result: 'FAIL', details: e.message });
  }
}

const now = () => '2026-09-09T00:00:00.000Z';
const appContext = {
  projectId: 'prj_1',
  clientId: 'client',
  recruitmentStatus: 'OPEN',
  transactionStatus: 'NONE',
  acceptedApplicationId: null,
  recruitmentDeadlineAt: '2026-09-20T00:00:00.000Z',
};

function appDeps() {
  return {
    repository: new InMemoryApplicationRepository(),
    projectContext: {
      getProjectContext: async () => ({ ...appContext }),
      bumpApplicationCounts: async () => {},
    },
    notifications: { publish: async () => {} },
    projectApplications: {},
    now,
    nextRequestId: () => 'req_1',
  };
}

const body = { coverLetter: '가'.repeat(100), expectedAmount: 10000, expectedDurationDays: 10 };

function cpDeps(extra = {}) {
  const repo = new InMemoryContractsPaymentsRepository();
  const ctx = {
    ...appContext,
    recruitmentStatus: 'CLOSED',
    transactionStatus: 'CONTRACT_PENDING',
    acceptedApplicationId: 'app_1',
    projectVersion: 1,
    canceledAt: null,
    paymentPendingAt: null,
    title: '테스트 프로젝트 제목',
    ...extra.ctx,
  };
  let n = 0;
  const calls = { start: 0 };
  const port = {
    getProjectNegotiationContext: async () => ctx,
    markPaymentPending: async () => ({}),
    startProjectTransaction: async () => {
      calls.start++;
      ctx.transactionStatus = 'IN_PROGRESS';
      return {};
    },
    completeProjectTransaction: async () => ({}),
    restorePreContractProject: async () => ({}),
  };
  const notifications = new Proxy({}, { get: () => async () => {} });
  const coordinator = createTransactionLifecycleCoordinator({
    projects: port,
    snapshots: createContractsPaymentsSnapshotReader(repo),
    notifications,
  });
  const service = createPublicApiService({
    repo,
    projectPort: port,
    paymentGateway: {
      confirmPayment: async (i) => ({ ...i, status: 'PAID' }),
      retrievePayment: async () => ({}),
    },
    notifications,
    coordinator,
    now,
    randomId: (p) => `${p}_${++n}`,
    resolveApplicationFreelancer: async (id) => (id === 'app_1' ? 'freelancer' : null),
    ...extra.service,
  });
  return { repo, ctx, calls, service };
}

const client = { userId: 'client', role: 'CLIENT' };
const freelancer = { userId: 'freelancer', role: 'FREELANCER' };

async function contractFixture(d) {
  const a = await d.service.proposeNegotiationOffer('prj_1', client, {
    amount: 10000,
    currency: 'KRW',
  });
  const c = await d.service.acceptNegotiationOffer('prj_1', a.offer.offerId, freelancer, {
    expectedRound: 1,
  });
  return c.contractId;
}

async function signedFixture(d) {
  const id = await contractFixture(d);
  await d.service.signContract(id, client);
  await d.service.signContract(id, freelancer);
  return id;
}

function reviewDeps(opts = {}) {
  const completedAt = opts.completedAt ?? '2026-08-28T00:00:00.000Z';
  let clock = opts.now ?? '2026-09-09T00:00:00.000Z';
  const ratingCalls = { n: 0, failOnce: opts.failConsumerOnce ?? false, failed: false };
  return {
    repository: new InMemoryReviewRepository(),
    projectContext: {
      getProjectContext: async () => ({
        projectId: 'prj_1',
        clientId: 'client',
        freelancerId: 'freelancer',
        contractId: 'ctr_1',
        contractStatus: 'SIGNED',
        transactionStatus: 'COMPLETED',
        completedAt,
      }),
    },
    userExistsPort: { userExists: async () => true },
    events: { publishReviewCreated: async () => {} },
    ratingConsumer: {
      publishReviewCreated: async () => {
        if (ratingCalls.failOnce && !ratingCalls.failed) {
          ratingCalls.failed = true;
          throw new Error('consumer down');
        }
        ratingCalls.n++;
      },
    },
    now: () => clock,
    _setNow: (iso) => {
      clock = iso;
    },
    _ratingCalls: ratingCalls,
  };
}

await test('T01', '지원 입력 범위 위반 거부', async () => {
  await assert.rejects(() =>
    createApplication(appDeps(), 'prj_1', 'f1', { ...body, coverLetter: '짧음' }, 'k'),
  );
});

await test('T02', '동일 프로젝트·프리랜서 중복 지원 거부', async () => {
  const d = appDeps();
  await createApplication(d, 'prj_1', 'f1', body, 'k1');
  await assert.rejects(() => createApplication(d, 'prj_1', 'f1', body, 'k2'));
});

await test('T03', '지원 멱등키는 사용자·프로젝트별 격리', async () => {
  const d = appDeps();
  await createApplication(d, 'prj_1', 'f1', body, 'same');
  const r = await createApplication(d, 'prj_1', 'f2', body, 'same');
  assert.equal(r.body.freelancerId, 'f2', '다른 사용자의 지원서가 반환됨: ' + r.body.freelancerId);
});

await test('T04', '프로필 확인 불가 시 지원 차단', async () => {
  const r = await getApplicationEligibility(appDeps(), 'prj_1', 'f1');
  assert.equal(
    r.canApply,
    false,
    '프로필 포트 없이 canApply=true, profileCompletion=' + r.profileCompletion,
  );
});

await test('T05', '지원 멱등키 필수', async () => {
  await assert.rejects(() => createApplication(appDeps(), 'prj_1', 'f1', body, undefined));
});

await test('T06', '실제 ID 생성값은 스키마 varchar(40) 이내', async () => {
  const a = await new PrismaApplicationRepository({}).nextApplicationId();
  const r = await new PrismaReviewRepository({}).nextReviewId();
  assert.ok(a.length <= 40 && r.length <= 40, `application=${a.length}, review=${r.length}, schema=40`);
});

await test('T07', '선정되지 않은 사용자의 합의 수락 차단', async () => {
  const d = cpDeps();
  const a = await d.service.proposeNegotiationOffer('prj_1', client, {
    amount: 10000,
    currency: 'KRW',
  });
  await assert.rejects(() =>
    d.service.acceptNegotiationOffer(
      'prj_1',
      a.offer.offerId,
      { userId: 'outsider', role: 'FREELANCER' },
      { expectedRound: 1 },
    ),
  );
});

await test('T08', '선정된 당사자의 양측 서명', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  assert.equal((await d.repo.findContractById(id)).status, 'SIGNED');
});

await test('T09', 'SIGNED+PAID이면 프로젝트 시작', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  const p = await d.service.preparePayment(client, { contractId: id });
  await d.service.confirmPayment(client, {
    orderId: p.orderId,
    amount: 10000,
    paymentKey: 'fake',
  });
  assert.equal(
    d.calls.start,
    1,
    'PG 대역 승인 후 start 호출=' + d.calls.start + '; snapshot에 agreementId를 applicationId로 전달',
  );
});

await test('T10', '결제 승인 재요청은 멱등 성공', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  const p = await d.service.preparePayment(client, { contractId: id });
  const input = { orderId: p.orderId, amount: 10000, paymentKey: 'fake' };
  await d.service.confirmPayment(client, input);
  await d.service.confirmPayment(client, input);
});

await test('T11', '납품 승인 전 정산 RELEASED 차단', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  const p = await d.service.preparePayment(client, { contractId: id });
  await d.service.confirmPayment(client, {
    orderId: p.orderId,
    amount: 10000,
    paymentKey: 'fake',
  });
  try {
    await d.service.simulateSettlementResult(p.paymentId, 'SUCCESS');
  } catch {
    /* 가드 throw도 성공 */
  }
  assert.notEqual((await d.repo.findPaymentById(p.paymentId)).status, 'RELEASED');
});

await test('T12', '실제 업로드 없이 납품 요청 거부', async () => {
  const d = cpDeps();
  const id = await contractFixture(d);
  await assert.rejects(() =>
    d.service.requestDelivery(id, freelancer, {
      objectKey: 'unverified/key',
      uploadId: 'never-created',
      message: 'test',
      idempotencyKey: 'k',
    }),
  );
});

await test('T13', 'Prisma 멱등 기록은 repository 재생성 후 유지', async () => {
  const fake = {};
  const a = new PrismaContractsPaymentsRepository(fake);
  await a.setIdempotent('sign', 'key', { ok: true });
  assert.deepEqual(await new PrismaContractsPaymentsRepository(fake).getIdempotent('sign', 'key'), {
    ok: true,
  });
});

await test('T14', 'Prisma 재저장 시 기존 offer ID 보존', async () => {
  let inserted = [];
  const fake = {
    agreement: { upsert: async () => {} },
    negotiationOffer: {
      deleteMany: async () => {},
      createMany: async (q) => {
        inserted = q.data;
      },
    },
  };
  const p = new PrismaContractsPaymentsRepository(fake);
  await p.saveAgreement({
    agreementId: 'agr_1',
    projectId: 'prj_1',
    applicationId: 'app_1',
    proposedByUserId: 'client',
    status: 'PROPOSED',
    agreedAmount: 10000,
    respondedAt: null,
    offers: [
      {
        offerId: 'ofr_stable',
        round: 1,
        amount: 10000,
        offeredByUserId: 'client',
        rejectedReason: null,
      },
    ],
  });
  assert.equal(inserted[0].id, 'ofr_stable', 'Prisma에 전달하는 ID가 변경됨');
});

await test('T15', '프로젝트 취소 확정 후 후처리 무효화 허용', async () => {
  const d = cpDeps();
  await contractFixture(d);
  d.ctx.transactionStatus = 'CANCELED';
  d.ctx.canceledAt = now();
  await d.service.invalidateAgreement('prj_1', {
    cancellationId: 'can_1',
    actorUserId: 'client',
    reason: 'PROJECT_CANCELED',
    occurredAt: now(),
  });
});

await test('T16', '리뷰 양측 제출 전 상대 리뷰 비공개', async () => {
  const d = reviewDeps();
  const r = await createReview(d, 'prj_1', 'client', { rating: 5, tags: [], content: '좋아요' }, 'k');
  assert.equal(r.body.visibility, 'BLINDED');
});

await test('T17', '리뷰 양측 작성 시 공개분 평균', async () => {
  const d = reviewDeps();
  await createReview(d, 'prj_1', 'client', { rating: 5, tags: [], content: '좋아요' }, 'k');
  await createReview(d, 'prj_1', 'freelancer', { rating: 3, tags: [], content: '좋아요' }, 'k');
  assert.deepEqual(await getPublishedRatingAggregate(d, 'freelancer'), {
    ratingSum: 5,
    reviewCount: 1,
  });
});

await test('T18', '완료일+14일 이후 신규 리뷰 차단', async () => {
  await assert.rejects(() =>
    createReview(
      reviewDeps({ completedAt: '2026-08-01T00:00:00.000Z' }),
      'prj_1',
      'client',
      { rating: 5, tags: [], content: '좋아요' },
      'k',
    ),
  );
});

await test('T19', '최신 리뷰 태그 WORK_QUALITY 허용', async () => {
  await createReview(
    reviewDeps(),
    'prj_1',
    'client',
    { rating: 5, tags: ['WORK_QUALITY'], content: '좋아요' },
    'k',
  );
});

await test('T20', '리뷰 content 필드 보존', async () => {
  const r = await createReview(
    reviewDeps(),
    'prj_1',
    'client',
    { rating: 5, tags: [], content: '보존해야 하는 평가' },
    'k',
  );
  assert.equal(r.body.content, '보존해야 하는 평가');
});

await test('T21', '리뷰 과도한 본문 거부', async () => {
  await assert.rejects(() =>
    createReview(
      reviewDeps(),
      'prj_1',
      'client',
      { rating: 5, tags: [], content: '가'.repeat(1001) },
      'k',
    ),
  );
});

await test('T22', '정산 수수료 계산', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  const p = await d.service.preparePayment(client, { contractId: id });
  const row = await d.repo.findPaymentById(p.paymentId);
  assert.equal(row.platformFeeAmount, 1000);
  assert.equal(row.settlementAmount, 9000);
});

const web = express();
web.use(express.json());
const auth = (req, _res, next) => {
  req.user = { userId: 'client', role: 'CLIENT' };
  next();
};
web.use(createReviewRouter(reviewDeps(), { requireAuth: auth }));
web.use(createApplicationRouter(appDeps(), { requireAuth: auth }));
const server = web.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = 'http://127.0.0.1:' + server.address().port;

await test('T23', '최신 /reviews/me 라우트 연결', async () => {
  assert.equal((await fetch(base + '/api/v1/projects/prj_1/reviews/me')).status, 200);
});

await test('T24', '최신 /users/:id/rating 라우트 연결', async () => {
  assert.equal((await fetch(base + '/api/v1/users/client/rating')).status, 200);
});

await test('T25', '리뷰 수정 요청은 명세대로 405', async () => {
  assert.equal((await fetch(base + '/api/v1/projects/prj_1/reviews', { method: 'PATCH' })).status, 405);
});

await test('T26', '사용자 공개 리뷰 목록 라우트', async () => {
  assert.equal((await fetch(base + '/api/v1/users/client/reviews')).status, 200);
});

await new Promise((r) => server.close(r));

await test('T27', '리뷰 content 잘못된 타입은 업무 검증 오류', async () => {
  try {
    await createReview(
      reviewDeps(),
      'prj_1',
      'client',
      { rating: 5, tags: [], content: /** @type {any} */ (123) },
      'k',
    );
    assert.fail('expected rejection');
  } catch (err) {
    assert.ok(err && typeof err === 'object' && 'httpStatus' in err);
    assert.equal(/** @type {any} */ (err).httpStatus, 422);
    assert.ok(String(/** @type {any} */ (err).message).includes('리뷰 내용'));
  }
});

await test('T28', '공개 평점 소비 실패 후 동일 요청으로 복구', async () => {
  const d = reviewDeps({ failConsumerOnce: true });
  await createReview(d, 'prj_1', 'client', { rating: 5, tags: [], content: '좋아요' }, 'k1');
  await assert.rejects(() =>
    createReview(d, 'prj_1', 'freelancer', { rating: 3, tags: [], content: '좋아요' }, 'k2'),
  );
  // 멱등 재시도 — 공개 2건 consumer 재실행
  await createReview(d, 'prj_1', 'freelancer', { rating: 3, tags: [], content: '좋아요' }, 'k2');
  assert.equal(d._ratingCalls.n, 2, 'ratingConsumer 성공 호출=' + d._ratingCalls.n);
});

await test('T29', '마감 후 단독 공개와 평점 후처리 동기화', async () => {
  const d = reviewDeps({
    completedAt: '2026-08-20T00:00:00.000Z',
    now: '2026-08-25T00:00:00.000Z',
  });
  await createReview(d, 'prj_1', 'client', { rating: 5, tags: [], content: '좋아요' }, 'k');
  assert.equal(d._ratingCalls.n, 0);
  d._setNow('2026-09-10T00:00:00.000Z'); // deadline(08-20+14d) 이후
  await listProjectReviews(d, 'prj_1', 'client');
  assert.equal(d._ratingCalls.n, 1, '단독 공개 후 consumer=' + d._ratingCalls.n);
  const pub = await getPublishedRatingAggregate(d, 'freelancer');
  assert.equal(pub.reviewCount, 1);
});

await test('T30', '계약 제목 스냅샷 저장', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  const c = await d.repo.findContractById(id);
  assert.equal(c.projectTitleSnapshot, '테스트 프로젝트 제목');
});

await test('T31', '계약 프리랜서의 결제 준비 차단', async () => {
  const d = cpDeps();
  const id = await signedFixture(d);
  await assert.rejects(() => d.service.preparePayment(freelancer, { contractId: id }));
});

const outPath = join(__dirname, 'logs/audit-probes.json');
fs.mkdirSync(join(__dirname, 'logs'), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      total: results.length,
      pass: results.filter((x) => x.result === 'PASS').length,
      fail: results.filter((x) => x.result === 'FAIL').length,
      results,
    },
    null,
    2,
  ),
);

for (const r of results) {
  console.log(
    `${r.result} ${r.id} ${r.name}${r.details ? ' | ' + String(r.details).replaceAll('\n', ' ') : ''}`,
  );
}
console.log(
  `TOTAL ${results.length} PASS ${results.filter((x) => x.result === 'PASS').length} FAIL ${results.filter((x) => x.result === 'FAIL').length}`,
);
