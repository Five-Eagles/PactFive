# ai-pricing 테스트 결과

담당자: 오민혁

테스트 날짜: 2026-08-27

테스트한 커밋: 커밋 전

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 6, FAIL 개수: 0)
- [x] prototype 범위 strict TypeScript 검사 통과

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 (run.tsx의 테스트 이름, 또는 직접 확인한 방법) | 결과 |
|---|---|---|
| 1 | R1·R4로 신규 프로젝트 claim과 기존 프로젝트 추천 금액 조회를 분리해 확인 | 통과 (인메모리 스텁) |
| 2 | R1·R4에서 입력 금액 없이 저장된 `recommendedAmount`만 반환하는지 확인 | 통과 (인메모리 스텁) |
| 3 | R3·R5에서 두 번째 프로젝트 claim과 다른 프로젝트 조회를 거부하는지 확인 | 통과 (인메모리 스텁) |
| 4 | R6에서 ai-pricing 스텁에 `projects.budgetAmount` 갱신이 없는지 정적 확인 | 통과 |
| 5 | R6에서 공개 route를 만들지 않았고 내부 포트만 존재하는지 확인 | 통과 |

## 아직 안 되는 것 (Known Issues)

- OpenAI 호출, 분석 생성, 공개 API와 UI는 계획대로 Step 2로 이월했다.
- `getPricingAnalysisRecommendation`은 읽기 전용이다. C-05의 프로젝트 예산 갱신과
  `pricing_analyses.applied_at` 기록을 하나의 원자 작업으로 만드는 방식은 아직 확정되지 않았다.
- 인메모리 스텁은 실제 DB transaction이나 조건부 UPDATE를 검증하지 않는다.

## 팀장에게 물어봐야 하는 것

- CR-0003의 읽기 전용 조회 형태를 최종 채택할지 확인이 필요하다.
- C-05의 exact replay 200과 조건부 UPDATE 0건 409를 구분할 저장 위치·판정 순서를 확정해야 한다.
