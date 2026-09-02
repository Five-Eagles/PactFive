# ai-pricing — API 계약

8월 28일 선행 작업에는 공개 REST API가 없다. project-management와의 내부 계약만 제공하며 정본은
`spec.md`와 `prototype/server/pricing-analysis.port.ts`다.

- 신규 프로젝트: `claimPricingAnalysisForCreatedProject(transaction, input)`
- 기존 프로젝트: `getPricingAnalysisRecommendation(query)`

OpenAI 분석 요청·리포트 API는 Step 2 본기능에서 별도로 정의한다.
