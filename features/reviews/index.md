# reviews Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/reviews/)
- spec.md: 상호 리뷰 규칙 1~13. 작성은 `COMPLETED`만 (I-24).
  방향당 1건·수정 불가 (I-23). 단독 공개 14일은 ASSUMPTION.
- api-contract.md: `POST/GET .../reviews`, `GET .../reviews/me`,
  `GET .../users/:userId/rating`, `GET .../users/:userId/reviews`. PATCH 없음.
  본문 `content`. `visibility`는 계산값. `review-summary`는 폐기.
- prototype/: 공개 API Mock(`createReviewApiMock`) + `run.tsx`.
  리뷰 화면은 하이브리드 REV-01. 작성 GET은 `/me`+`/rating`.
  확인 모달은 미리보기만. `npx tsx prototype/run.tsx` → PASS 69.
- design/: high-fi (`high-fi.html`) 페이지 본문. `.review-grid`. 앱 셸 없음.
  라우트 `/projects/:projectId/reviews`. 프리랜서 CTA는 applications `listMyApplications`
  (`ACCEPTED` ∧ `COMPLETED` 「완료됨」). 태그 표시명은 설계서 §10.
- change-requests/: E-19 태그 `0001-review-tag-codes-v2.md`.
  창·Projection `0002-review-window-and-rating-projection.md`.
- review/: 팀장 통합 요청 `review/teamlead-review-panel-api-2026-09-03.md`
  (당시 계약은 review-summary. 현재 원본은 `/rating`).

## 교차 담당
- 유동우: `transactionStatus` 읽기 (`COMPLETED` · `CANCELED`).
  공개 목록·상세는 PM 규칙 9 유지. 프리랜서 완료 가시성은 applications `GET .../applications/me`.
- 조준영 (applications): 프리랜서 CTA 소유. `listMyApplications`의 `transactionStatus`와
  「완료됨」배지. reviews는 작성 API·화면만.
- 오민혁: `REVIEW_CREATED` 소비·`users` 캐시 UPDATE는 오민혁(미구현).
  조준영은 `getPublishedRatingAggregate`만 제공.
- 팀장: `REVIEW_REQUESTED` 알림 발송. 발행은 CP `publishReviewRequested`.
- 팀장: sandbox 키 · 단독 공개 14일 ASSUMPTION · ERD 태그 CR.

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
| 2026-09-07 | 설계서 v2.0. `/me`·`/rating`·`content`·visibility. 태그 CR. PASS 65 |
| 2026-09-07 | 오케스트레이션 별칭 `getUserRatingSummary` = `getUserRating` / `getPublishedRatingAggregate` |
| 2026-09-07 | 실서비스 검토 F06·F07·F12 Mock. window·Projection·displayAverageRating. CR-0002 |
| 2026-09-07 | 규칙 11: 프리랜서 CTA = 내 지원 현황 ACCEPTED∧COMPLETED. PM 규칙 9 유지 |
| 2026-09-08 | feedback 항목 2 반영완료. 배치·내부합계 HTTP·app CTA는 이 Increment 밖. |
| 2026-09-09 | 9/8 feedback 항목 1 반영완료. E-39·E-40 원본 일치. isPublic 주석 위치만 요청 |
| 2026-09-09 | v2.0 이식 지시서 발행(09-03판 대체). 태그 한글 라벨 회신. CR-RV-001 반영중 |
| 2026-09-09 | 재이식 지시서 발행. app/이 v2.0 이전 이식본 — 태그·필드·경로·window 15건 |
