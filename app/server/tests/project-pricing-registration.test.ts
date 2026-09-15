import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { InMemoryPricingAnalysisRepository } from '../src/features/ai-pricing/in-memory-pricing-analysis.repository';
import { createPricingAnalysisClaimPort } from '../src/features/ai-pricing/pricing-analysis-claim.adapter';
import type { PricingAnalysisRow } from '../src/features/ai-pricing/pricing-analysis.types';
import { createInMemoryExternalPorts } from '../src/features/project-management/in-memory-external.adapter';
import { InMemoryProjectRepository } from '../src/features/project-management/in-memory-project.repository';
import { createProjectController } from '../src/features/project-management/project.controller';
import type { AuthContext } from '../src/features/project-management/project.port';
import { createProjectService } from '../src/features/project-management/project.service';
import type {
  ClientProjectDetail,
  CreateProjectInput,
  ErrorBody,
} from '../src/features/project-management/project.types';

// Run from the repository root: npx tsx --test app/server/tests/project-pricing-registration.test.ts
// The HTTP objects are test doubles; controller, service, claim adapter and both repositories are app code.
const NOW = '2026-09-07T00:00:00.000Z';
const CLIENT: AuthContext = { userId: 'usr_pricing_owner', role: 'CLIENT' };
const ANALYSIS_ID = 'pra_registration';

function analysis(overrides: Partial<PricingAnalysisRow> = {}): PricingAnalysisRow {
  return {
    analysisId: ANALYSIS_ID,
    requesterId: CLIENT.userId,
    inputSnapshot: {
      title: '프로젝트 등록 회귀 검증',
      description: 'AI 추천 예산을 선택한 프로젝트 등록 흐름을 확인합니다.',
      category: 'WEB_DEVELOPMENT',
    },
    requestFingerprint: 'registration-test-fingerprint',
    inputSchemaVersion: '1',
    idempotencyKey: 'registration-analysis-test',
    reviewStatus: 'APPROVED',
    result: {
      recommendedAmount: 4_800_000,
      currency: 'KRW',
      breakdown: [{ name: '개발', description: '웹 개발', amount: 4_800_000, rationale: '검증용 결과' }],
    },
    failureCode: null,
    failureSnapshot: null,
    failureHttpStatus: null,
    model: 'test-model',
    promptVersion: '1',
    schemaVersion: '1',
    projectId: null,
    createdAt: NOW,
    reviewedAt: NOW,
    appliedAt: null,
    ...overrides,
  };
}

function registration(overrides: Partial<CreateProjectInput> = {}): CreateProjectInput {
  return {
    title: '프로젝트 등록 회귀 검증',
    description: 'AI 추천 예산을 선택한 프로젝트 등록 흐름을 확인합니다.',
    category: 'WEB_DEVELOPMENT',
    recruitmentStartAt: null,
    recruitmentDeadlineAt: '2026-09-21T00:00:00.000Z',
    budgetAmount: 9_999_999,
    skillIds: ['REACT'],
    ...overrides,
  };
}

function setup(seed: PricingAnalysisRow = analysis()) {
  const projects = new InMemoryProjectRepository(() => NOW);
  const pricing = new InMemoryPricingAnalysisRepository([seed]);
  const ports = createInMemoryExternalPorts();
  ports.pricing = createPricingAnalysisClaimPort(pricing);
  let nextId = 0;
  const controller = createProjectController(createProjectService({
    repo: projects,
    ports,
    now: () => NOW,
    newProjectId: () => `prj_registration_${++nextId}`,
  }));

  async function postProject(input: CreateProjectInput, actor: AuthContext | null = CLIENT) {
    let status = 0;
    let body: unknown;
    const response = {
      status(code: number) {
        status = code;
        return response;
      },
      json(value: unknown) {
        body = value;
        return response;
      },
    };
    await controller.create(
      { body: input, user: actor ?? undefined } as Request,
      response as unknown as Response,
    );
    return { status, body };
  }

  return { projects, pricing, postProject };
}

test('registration payload claims the selected analysis and records the server recommendation as AI_ANALYSIS', async () => {
  const { projects, pricing, postProject } = setup();
  const response = await postProject(registration({ pricingAnalysisId: ANALYSIS_ID }));
  assert.equal(response.status, 201);
  const created = response.body as ClientProjectDetail;
  assert.equal(created.budgetAmount, 4_800_000, 'the submitted display amount must not override the analysis');
  assert.equal(created.budgetSource, 'AI_ANALYSIS');
  assert.equal(created.budgetSourceAt, NOW);
  assert.equal((await projects.findById(created.projectId))?.budgetSource, 'AI_ANALYSIS');
  const claimed = await pricing.findById(ANALYSIS_ID);
  assert.equal(claimed?.projectId, created.projectId);
  assert.ok(claimed?.appliedAt && Number.isFinite(Date.parse(claimed.appliedAt)));
});

for (const pricingAnalysisId of [undefined, null]) {
  test(`direct budget registration with analysis ID ${String(pricingAnalysisId)} keeps CLIENT_INPUT and does not claim`, async () => {
    const { pricing, postProject } = setup();
    const input = registration({ budgetAmount: 3_000_000 });
    if (pricingAnalysisId === null) input.pricingAnalysisId = null;
    const response = await postProject(input);
    assert.equal(response.status, 201);
    const created = response.body as ClientProjectDetail;
    assert.equal(created.budgetAmount, 3_000_000);
    assert.equal(created.budgetSource, 'CLIENT_INPUT');
    const unchanged = await pricing.findById(ANALYSIS_ID);
    assert.equal(unchanged?.projectId, null);
    assert.equal(unchanged?.appliedAt, null);
  });
}

test('another client cannot claim the analysis and the attempted project is excluded after rollback', async () => {
  const { projects, pricing, postProject } = setup();
  const before = await pricing.findById(ANALYSIS_ID);
  const response = await postProject(
    registration({ pricingAnalysisId: ANALYSIS_ID }),
    { userId: 'usr_other_client', role: 'CLIENT' },
  );
  assert.equal(response.status, 409);
  assert.equal((response.body as ErrorBody).error.code, 'PRICING_ANALYSIS_NOT_APPLICABLE');
  assert.equal((await projects.findAll()).length, 0);
  assert.equal(await projects.findById('prj_registration_1'), null);
  // Current app rollback is soft deletion until the Prisma transaction is connected.
  assert.equal((await projects.findByIdIncludingDeleted('prj_registration_1'))?.deletedAt, NOW);
  assert.deepEqual(await pricing.findById(ANALYSIS_ID), before);
});

for (const reviewStatus of ['PENDING', 'REJECTED'] as const) {
  test(`${reviewStatus} analysis fails closed without keeping the attempted project`, async () => {
    const { projects, pricing, postProject } = setup(analysis({
      reviewStatus,
      result: null,
      reviewedAt: reviewStatus === 'PENDING' ? null : NOW,
    }));
    const before = await pricing.findById(ANALYSIS_ID);
    const response = await postProject(registration({ pricingAnalysisId: ANALYSIS_ID }));
    assert.equal(response.status, 409);
    assert.equal((response.body as ErrorBody).error.code, 'PRICING_ANALYSIS_NOT_APPLICABLE');
    assert.equal((await projects.findAll()).length, 0);
    assert.equal((await projects.findByIdIncludingDeleted('prj_registration_1'))?.deletedAt, NOW);
    assert.deepEqual(await pricing.findById(ANALYSIS_ID), before);
  });
}

test('reusing a claimed analysis rejects the second project while preserving the original claim', async () => {
  const { projects, pricing, postProject } = setup();
  const first = await postProject(registration({ pricingAnalysisId: ANALYSIS_ID }));
  assert.equal(first.status, 201);
  const original = first.body as ClientProjectDetail;
  const originalClaim = await pricing.findById(ANALYSIS_ID);
  const duplicate = await postProject(registration({ pricingAnalysisId: ANALYSIS_ID }));
  assert.equal(duplicate.status, 409);
  assert.equal((duplicate.body as ErrorBody).error.code, 'PRICING_ANALYSIS_NOT_APPLICABLE');
  assert.deepEqual(
    (await projects.findAll()).map((project) => project.projectId), [original.projectId]);
  assert.equal((await projects.findByIdIncludingDeleted('prj_registration_2'))?.deletedAt, NOW);
  assert.deepEqual(await pricing.findById(ANALYSIS_ID), originalClaim);
});

test('an unknown analysis rolls back registration without changing another analysis', async () => {
  const { projects, pricing, postProject } = setup();
  const before = await pricing.findById(ANALYSIS_ID);
  const response = await postProject(registration({ pricingAnalysisId: 'pra_missing' }));
  assert.equal(response.status, 409);
  assert.equal((response.body as ErrorBody).error.code, 'PRICING_ANALYSIS_NOT_APPLICABLE');
  assert.equal((await projects.findAll()).length, 0);
  assert.equal((await projects.findByIdIncludingDeleted('prj_registration_1'))?.deletedAt, NOW);
  assert.deepEqual(await pricing.findById(ANALYSIS_ID), before);
});
