# 2026-09-09 — reviews 라우트 3종 신설 + 웹 라우트 수정 (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 4번째 단위.
근거: `features/reviews/review/teamlead-port-instructions-2026-09-09.md`(조준영, §3).

## 무엇을 했나

- **`GET /projects/:projectId/reviews/me`** 신설 (`getMyProjectReview`). `review_windows`가
  아직 없어(#203, CR-RV-002 대기) `reviewDeadlineAt`은 항상 `null`이고 `REVIEW_PERIOD_CLOSED`
  사유는 아직 안 걸린다 — 지시서가 명시적으로 허용한 축소판이다.
- **`GET /users/:userId/rating`** — `review-summary`를 대체(경로·함수명·타입명
  `getReviewSummary`→`getUserRating`/`GetReviewSummaryResponse`→`GetUserRatingResponse` 전부).
  오케스트레이션 별칭 `getUserRatingSummary` 추가.
- **`GET /users/:userId/reviews`** 신설 (`listUserReviews`). `PUBLISHED`만,
  `publishedAt DESC, reviewId DESC`, `page` 1~1000·`pageSize` 1~50(기본 20).
- **웹**: `/projects/:projectId/review` → `/reviews`(복수형)로 라우트·경로 상수 변경.
  `fetchReviewSummary`→`fetchUserRating`(경로 `rating`으로).
- **안 한 것(의도적)**: 405 응답(지시서 R2 — "급하지 않다"), 태그 라벨 서버 이전(R4 — 원안대로
  웹 상수 유지).

## 담당자별 영향 · 후속 조치

**조준영 (reviews)** — 영향 없음, 후속 조치 없음. 지시서 그대로 반영했다.

**오민혁 (applications)** — 영향 없음, 아직은. 「완료됨」 배지 CTA가 `/reviews`로 갈 예정인데,
현재 app/web의 applications 폴더에는 그 CTA 링크 자체가 아직 없다(grep 확인 — 전무). #200에서
새로 만들 때 `REVIEW_ROUTES.project(projectId)`를 쓰면 이미 복수형이라 따로 맞출 것이 없다.

**다른 기능** — 영향 없음(reviews 폴더 밖 참조 없음, grep 확인).

## 검증

- `app/server`, `app/web` tsc 통과
- `app/web` vite build 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과
