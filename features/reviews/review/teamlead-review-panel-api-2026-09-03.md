# 리뷰 패널·공개 API 통합 요청 — 팀장

| | |
|---|---|
| 받는 사람 | 팀장 (`app/` 통합 · ADR-0006) |
| 보내는 사람 | 조준영 · reviews |
| 날짜 | 2026-09-03 |
| 정본 | `spec.md` 규칙 1~13 · `design/high-fi.html` · `api-contract.md` · `prototype/` Mock |
| 목적 | app에 없는 리뷰 패널·공개 API를 팀장이 옮길 때 쓸 한 장 |

조준영은 `app/`을 직접 채우지 않는다. 원본은 `features/reviews/`에 있다
(ADR-0006). Increment는 PR [#53](https://github.com/Five-Eagles/PactFive/pull/53).
`npx tsx features/reviews/prototype/run.tsx` → PASS 40.

---

## Discord

조준영(reviews)입니다. 리뷰 패널과 공개 API가 `app/`에 없습니다. 웹 `/reviews`는 `NotIntegratedPage`입니다. 시안 정본은 `design/high-fi.html`, prototype 참고는 `ReviewPanel.tsx`, Mock은 `createReviewApiMock`입니다. 공개는 create/list/review-summary, 내부는 `getPublishedRatingAggregate`입니다. PATCH 없습니다. 결제 완료 후 작성 진입은 CP `publishReviewRequested`입니다. 14일은 ASSUMPTION입니다. `REVIEW_REQUESTED` 발송은 팀장, `REVIEW_CREATED` 소비는 오민혁입니다. `app/`은 팀장님만 수정해 주세요. 정본: `features/reviews/review/teamlead-review-panel-api-2026-09-03.md`.

---

## 웹 — 리뷰 패널

지금 `app/web`의 `/reviews`는 `NotIntegratedPage`다. `ReviewPanel` import는 app에 없다.
시안 라우트는 `/projects/:projectId/reviews`다.

| 화면 | 구조 정본 (시안) | 참고 (prototype) |
|---|---|---|
| 작성 전 | `design/high-fi.html` | `ReviewPanel.tsx` `view="empty"` |
| 불러오는 중 | 같은 시안 | `view="loading"` |
| 불러오기 실패 | 같은 시안 | `view="loadFailed"` |
| 409 중복 | 같은 시안 | `view="duplicate"` |
| 409 미완료 | 같은 시안 | `view="incomplete"` |
| 409 취소 | 같은 시안 | `view="canceled"` |
| 제출 후 | 같은 시안 | `view="submitted"` |

시안이 구조 정본이다. prototype 패널은 동작·카피 참고다. 둘이 다르면 시안이 옳다
(`app/web/AGENTS.md`). 앱 셸·수정 버튼은 넣지 않는다. 필수 요소는 시안 표
(별점 · 상대 리뷰는 아직 없습니다 · 14일 안내 · 리뷰 작성 /
불러오는 중 · 불러오지 못했습니다 · 다시 시도 /
이미 작성한 리뷰입니다 · 거래가 완료되지 않았습니다 ·
취소된 거래는 리뷰할 수 없습니다). 제출 화면에는 수정 버튼이 없어야 한다.

14일 안내 문구는 ASSUMPTION이다. 일수를 코드로 확정하지 않는다.

---

## 서버 — 공개 API + 내부 집계

정본: `features/reviews/api-contract.md`.
Mock: `createReviewApiMock` (`prototype/index.ts` export).
`review.repository.ts`는 호출하면 not implemented다. 실 DB는 팀장 통합.

| 경로 | 함수 |
|---|---|
| `POST /api/v1/projects/:projectId/reviews` | `createReview` |
| `GET /api/v1/projects/:projectId/reviews` | `listProjectReviews` |
| `GET /api/v1/users/:userId/review-summary` | `getReviewSummary` |

브라우저. `Authorization: Bearer <accessToken>`. POST는 `Idempotency-Key` 필수.
작성 = 해당 거래 당사자 + `COMPLETED`. 목록 = 당사자는 본인 미공개+공개, 비당사자는 공개만.

내부 — `getPublishedRatingAggregate`는 브라우저 `/api/v1`이 아니다. 정본은 함수명 (D-48).
오민혁이 `REVIEW_CREATED` 수신 후 호출한다. 공개분만 `{ ratingSum, reviewCount }`.
반올림 없음. 0건이면 `{ 0, 0 }`. `getReviewSummary`는 브라우저용 평균을 유지한다.

PATCH/PUT/DELETE `/reviews` 없음. 호출하면 405. 공개 라우트로 다시 만들지 않는다.

---

## 교차 · 알림

작성 진입은 결제 완료 후다. contracts-payments가 `publishReviewRequested`를 발행하면
당사자가 리뷰를 쓴다. 발행은 CP, 발송(`REVIEW_REQUESTED`)은 팀장.

`REVIEW_CREATED`는 공개 커밋 이후 5필드만 발행한다
(`reviewId` · `projectId` · `revieweeId` · `rating` · `publishedAt`).
조준영은 포트에 **쌓기만** 한다. users 캐시 UPDATE는 오민혁.
합계 정본은 `getPublishedRatingAggregate`다.

단독 공개 14일은 ASSUMPTION (PRD에 기간 없음). 회신 전 상수를 바꾸지 않는다.

---

## 해당 없음

`app/web`·`app/server`를 조준영이 수정, `NotIntegratedPage` 교체,
14일 상수 확정 구현, 알림 발송, 오민혁 users UPDATE, PATCH/삭제,
`develop` 직접 push.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| I1 | `design/high-fi.html`을 패널 구조 정본으로 웹에 넣을 수 있는가 | | | |
| I2 | 공개 create/list/review-summary만 서빙하고 PATCH는 없는가. 내부는 `getPublishedRatingAggregate`인가 | | | |
| I3 | 단독 공개 14일을 ASSUMPTION으로 두고 회신 전 상수를 바꾸지 않는가 | | | |
| I4 | `REVIEW_REQUESTED` 발송은 팀장, `REVIEW_CREATED` 소비는 오민혁인가 | | | |

회신 전에도 `features/reviews/` 원본은 유지한다. `app/` 반영은 팀장만 한다.
