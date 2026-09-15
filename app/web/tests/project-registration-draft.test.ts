import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPricingRecommendation,
  buildProjectRegistrationRequest,
  EMPTY_REGISTER_DRAFT,
  updateRegistrationBudget,
  type RegisterDraft,
} from '../src/features/project-management/project-registration-draft';

const draft: RegisterDraft = {
  title: '프로젝트 등록 테스트',
  description: '이미 입력한 프로젝트 설명과 일정을 보존하는 테스트입니다.',
  category: 'WEB_DEVELOPMENT',
  recruitmentStartAt: '',
  recruitmentDeadlineAt: '2026-10-01',
  budgetAmount: '1,000,000',
  skillIds: ['REACT'],
};
const recommendation = new URLSearchParams({
  recommendedBudget: '5000000',
  pricingAnalysisId: 'analysis-test-1',
});

test('AI 복귀 → 초안 → 등록 요청이 동일 분석 ID를 전달한다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  assert.deepEqual(buildProjectRegistrationRequest(applied), {
    title: draft.title,
    description: draft.description,
    category: draft.category,
    recruitmentStartAt: null,
    // 입력 날짜는 KST 기준 하루의 끝으로 저장하므로 UTC에서는 14:59:59가 된다.
    recruitmentDeadlineAt: '2026-10-01T14:59:59.000Z',
    budgetAmount: 5000000,
    skillIds: ['REACT'],
    pricingAnalysisId: 'analysis-test-1',
  });
  assert.equal(draft.budgetAmount, '1,000,000');
  assert.equal(draft.pricingAnalysisId, undefined);
});

test('sessionStorage 직렬화·복원 후에도 예산과 분석 ID가 함께 유지된다', () => {
  const value = applyPricingRecommendation(draft, recommendation);
  const serialized = JSON.stringify({ version: 1, savedAt: '2026-09-07T00:00:00Z', value });
  const restored = JSON.parse(serialized).value as RegisterDraft;
  assert.deepEqual(buildProjectRegistrationRequest(restored), buildProjectRegistrationRequest(value));
});

test('분석 ID가 없는 기존 v1 초안은 입력을 보존하고 직접 입력으로 제출된다', () => {
  const payload = buildProjectRegistrationRequest(draft);
  assert.equal(payload.title, draft.title);
  assert.equal(payload.budgetAmount, 1000000);
  assert.equal('pricingAnalysisId' in payload, false);
});

test('예산을 수동 변경하면 ID를 생략하고 사용자가 입력한 금액을 제출한다', () => {
  const updated = updateRegistrationBudget(applyPricingRecommendation(draft, recommendation), '6,000,000');
  const payload = buildProjectRegistrationRequest(updated);
  assert.equal(updated.pricingAnalysisId, null);
  assert.equal(payload.budgetAmount, 6000000);
  assert.equal('pricingAnalysisId' in payload, false);
});

test('같은 금액의 쉼표·공백 서식 변경은 추천 연결을 유지한다', () => {
  const updated = updateRegistrationBudget(applyPricingRecommendation(draft, recommendation), ' 5,000,000 ');
  assert.equal(updated.pricingAnalysisId, 'analysis-test-1');
  assert.equal(buildProjectRegistrationRequest(updated).budgetAmount, 5000000);
});

test('연결 해제 뒤 추천 금액으로 되돌려 입력해도 자동 재연결하지 않는다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  const edited = updateRegistrationBudget(applied, '6000000');
  const reverted = updateRegistrationBudget(edited, '5000000');
  assert.equal('pricingAnalysisId' in buildProjectRegistrationRequest(reverted), false);
});

test('빈칸·잘못된 금액을 입력하면 분석 연결을 해제한다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  for (const amount of ['', ' ', 'invalid', 'Infinity', '-1', '0', '1.5']) {
    assert.equal(updateRegistrationBudget(applied, amount).pricingAnalysisId, null);
  }
});

test('새 분석을 채택하면 금액과 ID만 함께 교체한다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  const next = applyPricingRecommendation(applied, new URLSearchParams({
    recommendedBudget: '7000000', pricingAnalysisId: 'analysis-test-2',
  }));
  assert.equal(next.budgetAmount, '7000000');
  assert.equal(next.pricingAnalysisId, 'analysis-test-2');
  assert.equal(next.description, draft.description);
  assert.deepEqual(next.skillIds, draft.skillIds);
});

test('불완전·잘못된·중복 복귀 파라미터는 기존 입력을 덮어쓰지 않는다', () => {
  for (const query of [
    '', 'recommendedBudget=100', 'pricingAnalysisId=test',
    'recommendedBudget=100&pricingAnalysisId=%20',
    'recommendedBudget=&pricingAnalysisId=test',
    'recommendedBudget=invalid&pricingAnalysisId=test',
    'recommendedBudget=-100&pricingAnalysisId=test',
    'recommendedBudget=1.5&pricingAnalysisId=test',
    'recommendedBudget=9007199254740992&pricingAnalysisId=test',
    'recommendedBudget=100&pricingAnalysisId=one&pricingAnalysisId=two',
    'recommendedBudget=100&recommendedBudget=200&pricingAnalysisId=test',
  ]) {
    assert.equal(applyPricingRecommendation(draft, new URLSearchParams(query)), draft);
  }
});

test('StrictMode에서 같은 추천을 두 번 적용해도 결과가 동일하다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  assert.deepEqual(applyPricingRecommendation(applied, recommendation), applied);
});

test('실패 후 재시도용 요청을 만들어도 초안·분석 ID를 소비하지 않는다', () => {
  const applied = applyPricingRecommendation(draft, recommendation);
  const first = buildProjectRegistrationRequest(applied);
  first.skillIds.push('SQL');
  assert.deepEqual(buildProjectRegistrationRequest(applied).skillIds, ['REACT']);
  assert.equal(buildProjectRegistrationRequest(applied).pricingAnalysisId, 'analysis-test-1');
});

test('처음부터 작성하는 빈 초안에는 분석 연결이 없다', () => {
  assert.equal(EMPTY_REGISTER_DRAFT.pricingAnalysisId, null);
  assert.equal('pricingAnalysisId' in buildProjectRegistrationRequest(EMPTY_REGISTER_DRAFT), false);
});
