# reviews Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/reviews/)
- spec.md: 상호 리뷰 규칙 1~13. 작성은 `COMPLETED`만 (I-24).
  방향당 1건·수정 불가 (I-23). 단독 공개 14일은 ASSUMPTION.
- api-contract.md: `POST/GET .../reviews`, `GET .../review-summary`. PATCH 없음.
- prototype/: 공개 API Mock(`createReviewApiMock`) + `run.tsx`.
  `npx tsx prototype/run.tsx` → PASS 38.
- design/: high-fi 1화면 (`high-fi.html`). 패널만 (앱 셸 없음). 라우트 `/projects/:projectId/reviews`.
  low-fi는 `low-fi.html`에 남김.

## 교차 담당
- 유동우: `transactionStatus` 읽기 (`COMPLETED` · `CANCELED`).
- 오민혁: 회신 반영. `REVIEW_CREATED` 소비·`users` 캐시 UPDATE는 오민혁(미구현).
  조준영은 `getPublishedRatingAggregate`만 제공. 계약: `../contracts-payments/review/external-wait-2026-08-31.md` §3.
- 최윤석: `REVIEW_REQUESTED` 알림 발송. 발행은 contracts-payments `publishReviewRequested`.
  계약: `../contracts-payments/review/yoonseok-ports-contract.md`.
- 팀장: sandbox 키 · 단독 공개 14일 ASSUMPTION. 같은 파일 §1·§2.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-28 | SPEC 규칙 1~13 · API 초안. Mock·design 없음 |
| 2026-08-31 | 규칙 13 Increment: Mock · low-fi 1화면 · run.tsx PASS 35 |
| 2026-08-31 | 외부 대기 고정. 14일·REVIEW_CREATED·REVIEW_REQUESTED는 회신 후 |
| 2026-08-31 | high-fi 리뷰 패널. 앱 셸 없음. 필수 요소·상태 분기 유지 |
| 2026-08-31 | 규칙 12: `publishReviewRequested` 발행 / 발송은 최윤석 |
| 2026-08-31 | 오민혁 회신: `getPublishedRatingAggregate`. 소비는 오민혁. run.tsx PASS 38 |
