# reviews Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/reviews/)
- spec.md: 상호 리뷰 규칙 1~13. 작성은 `COMPLETED`만 (I-24).
  방향당 1건·수정 불가 (I-23). 단독 공개 14일은 ASSUMPTION.
- api-contract.md: `POST/GET .../reviews`, `GET .../review-summary`. PATCH 없음.
- prototype/: 공개 API Mock(`createReviewApiMock`) + `run.tsx`.
  `npx tsx prototype/run.tsx` → PASS 35.
- design/: low-fi 1화면 (`low-fi.html`). 라우트 `/projects/:projectId/reviews`.

## 교차 담당
- 유동우: `transactionStatus` 읽기 (`COMPLETED` · `CANCELED`).
- 오민혁: `REVIEW_CREATED`로 `rating_average` 갱신 (E-13). 조준영은 users를 UPDATE하지 않는다.
- 최윤석: `REVIEW_REQUESTED` 알림. 이 Increment에서 호출하지 않는다.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-28 | SPEC 규칙 1~13 · API 초안. Mock·design 없음 |
| 2026-08-31 | 규칙 13 Increment: Mock · low-fi 1화면 · run.tsx PASS 35 |
