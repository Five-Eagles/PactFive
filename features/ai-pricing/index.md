# ai-pricing Index

담당자: 오민혁

## 현재 범위

- Step 1 선행 계약 스텁만 구현
- 프로젝트 생성용 `claimPricingAnalysisForCreatedProject`
- 기존 프로젝트 예산 반영용 `getPricingAnalysisRecommendation`
- 다른 도메인의 공개 import 입구는 `prototype/index.ts`
- AI 단가 분석 생성·OpenAI 연동·화면·공개 API는 Step 2로 이월

## 로컬 검증

리포 루트에서 `npx tsx features/ai-pricing/prototype/run.tsx`를 실행한다.
