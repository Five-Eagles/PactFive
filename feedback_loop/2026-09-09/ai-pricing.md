# ai-pricing 피드백 — 2026-09-09 PR #91 통합 검토 (반영 불필요 결론)

대상 원본 커밋: `3fb3b7f` `fix(ai-pricing): 실제 실패 화면의 샘플 견적 노출 차단 (#91)` (develop, 2026-09-08)
통합 기준: `origin/develop 7fccffa`, 작업 브랜치 `feature/user-management-notifications-ai-pricing-integration`
sync-log.md 기록: 없음(이 브랜치는 아직 커밋 전)

## 항목 1 — [검토] #91의 "샘플 견적 노출" 버그가 app/web에도 있는지 확인

상태: 확인 완료 — **app/web 반영 불필요**

**Fact — 원본 버그와 수정**
- `features/ai-pricing/test-report.md`(커밋 `3fb3b7f`)에 따르면 원본 버그는: 실제 분석 요청이
  실패해 `analysis`가 없을 때도 `status === 'error'`만으로 하드코딩된 샘플
  (`pra_preview_1`, 1,500,000원) 보고서와 추천 채택 버튼이 그려졌다.
- 수정은 `selectPricingAnalysisForDisplay(analysis, previewState)` 함수를 추가해, 실제 응답이
  있으면 그것을 우선하고, 없을 때도 `previewState`가 `ready|applying|applied|conflict|error`
  중 하나로 **명시적으로** 지정된 경우에만 샘플을 복제해 반환하도록 바꿨다. `previewState`가
  없는 일반 실패 경로에서는 `null`을 반환해 샘플이 나오지 않는다.

**Fact — app/web 코드 대조 (2026-09-09 확인)**
- `app/web/src/features/ai-pricing/` 전체에서 `PREVIEW_ANALYSIS`, `previewState`,
  `selectPricingAnalysisForDisplay`를 grep한 결과 0건 — 이 샘플 대체 메커니즘 자체가 app/web에
  존재하지 않는다.
- `usePricingAnalysis.ts`의 `analysis` state는 `createPricingAnalysis`·`fetchPricingAnalysis`·
  `applyPricingAnalysis` 응답, 또는 에러 바디의 `details.analysis`(REJECTED 판정도 서버가 준
  실제 분석 레코드)로만 설정된다. 하드코딩된 표본 데이터를 대신 넣는 경로가 없다.
- `NewPricingAnalysisPage.tsx`·`PricingAnalysisApplyPage.tsx` 두 화면 모두 `ResultReport`
  렌더 조건이 `status === 'ready'|'applying'|'applied'` 계열과 `analysis?.result`를 함께
  요구하고, 실패 패널(`AnalysisFailurePanel`/`ApplyFailurePanel`)은 `status === 'error'`
  조건이라 두 조건이 상호 배타적이다. 실패 상태에서 결과 패널이 같이 뜰 수 없는 구조다.

**결론 (Fact에 근거)**
- app/web은 원본이 갖고 있던 "샘플 데이터를 실패 화면에 대체 노출"하는 코드 경로 자체가
  없으므로 동일한 버그가 구조적으로 발생하지 않는다. 코드 반영 없이 검토만으로 완료.

**담당자 메모**
- 이번 통합 브랜치에서 ai-pricing 관련 코드 변경 없음. user-management(#89)·
  notifications(#90) 반영이 이어진다.
