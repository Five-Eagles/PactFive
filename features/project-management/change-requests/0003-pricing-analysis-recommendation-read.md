# CR-0003 — 저장된 추천 금액을 읽는 함수가 필요하다

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-08-26 |
| 확인 필요 | 오민혁 (ai-pricing) |
| 상태 | 제안 — 임시 어댑터로 구현, 회신 후 확정 |
| 관련 | spec.md 규칙 40·52·53 · api-contract.md `apply-pricing-budget` |

## 요약

`applyPricingAnalysisBudget`(규칙 40)을 구현하려면 **이미 저장된 분석의 추천 금액을
읽을 방법**이 필요하다. 2026-08-25 회신에는 등록 시점의
`claimPricingAnalysisForCreatedProject` 하나만 있었다.

## 왜 `claim`을 재사용할 수 없나

두 경로는 시점이 다르다.

| | 등록 시점 | 예산 반영 시점 |
|---|---|---|
| 상황 | 프로젝트를 **지금 만드는 중** | 프로젝트가 **이미 있음** |
| 함수 | `claimPricingAnalysisForCreatedProject` | ← 필요한 것 |
| 트랜잭션 | 등록 트랜잭션 안 (규칙 52) | 별개 |
| 하는 일 | 분석을 프로젝트에 **연결**하고 금액을 받음 | 금액만 **읽음** |

`claim`은 등록 트랜잭션 전용이고 연결까지 수행한다. 이미 연결된 분석에 다시 호출하면
동작이 어떻게 되는지도 정해진 바 없다.

## 제안

읽기 전용 함수를 하나 추가한다.

```ts
type PricingRecommendationQuery = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

getPricingAnalysisRecommendation(
  query: PricingRecommendationQuery,
): Promise<{ recommendedAmount: number }>;
```

- `requesterId`와 분석 생성자가 다르면 실패한다 — 규칙 53과 같은 판정이다
- 실패 사유는 그쪽 도메인 코드로 주시면 된다. 이쪽에서
  `409 PRICING_ANALYSIS_NOT_APPLICABLE`로 바꿔 내보낸다

## 대안

이 함수 없이 가려면 `applyPricingAnalysisBudget`이 **호출자가 보낸 금액을 받아야
한다.** 규칙 40이 그것을 금지하고 있어(*"클라이언트가 보낸 금액을 믿지 않는다"*)
채택하지 않았다.

## 현재 구현

`prototype/server/ports/external.port.ts`의 `PricingAnalysisClaimPort`에 위 형태로
선언하고, `prototype/mock/external.mock.ts`에 임시 어댑터를 두었다.

**실제 형태가 다르면 어댑터 한 곳만 고치면 된다.** 서비스 코드는 인터페이스만 본다.
