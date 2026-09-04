# reviews Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/reviews/)
- spec.md: 상호 리뷰 규칙 1~13. 작성은 `COMPLETED`만 (I-24).
  방향당 1건·수정 불가 (I-23). 단독 공개 14일은 ASSUMPTION.
- api-contract.md: `POST/GET .../reviews`, `GET .../review-summary`. PATCH 없음.
- prototype/: 공개 API Mock(`createReviewApiMock`) + `run.tsx`.
  리뷰 화면은 하이브리드 REV-01(페이지 본문, ViewModel). 설계서 신설 `REVIEW_*` 코드·
  `/contracts/:id/review` 경로는 쓰지 않는다. 작성 POST는 기존 `createReview`다.
  확인 모달은 미리보기만(실 POST 없음). `npx tsx prototype/run.tsx`로 확인한다.
- design/: high-fi (`high-fi.html`) 페이지 본문. `.review-grid`(1fr + 340px). 앱 셸 없음.
  라우트 `/projects/:projectId/reviews`. low-fi는 `low-fi.html`.
  오버레이·reduced-motion은 `design/panel.css`.
  작성 폼은 상대 제출 여부를 숨기고 14일 단독 공개 안내만 둔다. 일수는 ASSUMPTION이다.
- review/: 팀장 통합 요청 `review/teamlead-review-panel-api-2026-09-03.md`.

## 교차 담당
- 유동우: `transactionStatus` 읽기 (`COMPLETED` · `CANCELED`).
- 오민혁: 회신 반영. `REVIEW_CREATED` 소비·`users` 캐시 UPDATE는 오민혁(미구현).
  조준영은 `getPublishedRatingAggregate`만 제공. 계약: `../contracts-payments/review/external-wait-2026-08-31.md` §3.
- 팀장: `REVIEW_REQUESTED` 알림 발송. 발행은 contracts-payments `publishReviewRequested`.
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
| 2026-09-02 | 레퍼런스 오버레이·reduced-motion만 패널에 이식. 앱 셸·카드 그리드 없음 |
| 2026-09-02 | 토큰 정본 hex·Pretendard. 별점 입력 오류 예. 메타 리듬 데모 제거 |
| 2026-09-02 | 빈·제출 화면에 14일 단독 공개 안내. ASSUMPTION 유지 |
| 2026-09-03 | 회신 대기 중 재실측. `run.tsx` PASS 40. repository not implemented는 유지 |
| 2026-09-03 | 팀장 통합 요청 1장 (`review/teamlead-review-panel-api-2026-09-03.md`) |
| 2026-09-03 | `REVIEW_REQUESTED` 발송 담당을 팀장으로. applications 손잡이는 조준영 확정 |
| 2026-09-03 | 시안↔패널 14일 안내 문구 일치. ASSUMPTION 유지 |
| 2026-09-04 | 하이브리드 REV-01. 작성 GET 조립은 list+summary. 계약 경로·작성 마감 14일 없음 |
