# reviews Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/reviews/)
- spec.md: 상호 리뷰 설계 확정 (규칙 1~13). 작성은 `COMPLETED`만 (I-24).
  방향당 1건·수정 불가 (I-23). 단독 공개 14일은 ASSUMPTION.
- api-contract.md: `POST/GET .../reviews`, `GET .../review-summary` 초안. PATCH 없음.
- prototype/: 없음. 다음 스프린트.
- design/: 없음. 다음 스프린트.

## 교차 담당
- 유동우: `transactionStatus` 읽기 (`COMPLETED` · `CANCELED`).
- 오민혁: `REVIEW_CREATED`로 `rating_average` 갱신 (E-13). 조준영은 users를 UPDATE하지 않는다.
- 최윤석: `REVIEW_REQUESTED` 알림. 이 Increment에서 호출하지 않는다.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-28 | SPEC 규칙 1~13 · API 초안. Mock·design 없음 |
