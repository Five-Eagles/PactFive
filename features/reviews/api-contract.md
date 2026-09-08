# reviews — API 계약

형식은 `docs/naming-convention.md` §7·§6. Bearer 필수. POST는 `Idempotency-Key` 필수.
Mock: `prototype/mock/review.mock.ts`. 화면 `/projects/:projectId/reviews`.
프리랜서 CTA 소유는 applications `GET /api/v1/applications/me`의 `transactionStatus`.
reviews는 작성 API·화면만. 공개 프로젝트 상세에 거래 상태를 넣지 않는다 (PM 규칙 9).
`SUBMITTED` 컬럼·숨김 API·`/contracts/:id/review`는 없다. 본문은 `content`.
`GET .../review-summary`는 폐기하고 `GET .../rating`을 쓴다.

## POST /api/v1/projects/:projectId/reviews — `createReview`

규칙 1~4·8·10. 본문에 `direction`·`contractId` 없음.

```json
{ "rating": 5, "content": "요구사항을 명확히 전달해 주셨습니다.", "tags": ["CLEAR_REQUIREMENTS"] }
```

201:

```json
{
  "reviewId": "rvw_123",
  "projectId": "prj_123",
  "contractId": "ctr_123",
  "reviewerId": "usr_client_a",
  "revieweeId": "usr_freelancer_b",
  "direction": "CLIENT_TO_FREELANCER",
  "rating": 5,
  "content": "요구사항을 명확히 전달해 주셨습니다.",
  "tags": ["WORK_QUALITY"],
  "visibility": "BLINDED",
  "submittedAt": "2026-09-04T08:00:00Z",
  "editable": false
}
```

같은 키·같은 본문 200. 같은 키·다른 본문 409 `IDEMPOTENCY_KEY_REUSED`.
같은 방향 409 `REVIEW_ALREADY_SUBMITTED`. 기한 후 409 `REVIEW_PERIOD_CLOSED`.

에러: 400 `INVALID_REVIEW_RATING`. 401. 403 `REVIEW_FORBIDDEN`. 404 `PROJECT_NOT_FOUND`.
409 `PROJECT_NOT_COMPLETED`. 422 `REVIEW_CONTENT_INVALID` · `REVIEW_TAG_INVALID`.

## GET /api/v1/projects/:projectId/reviews — `listProjectReviews`

당사자는 본인 `BLINDED` + `PUBLISHED`. 비당사자는 `PUBLISHED`만. 상대 `BLINDED`는 넣지 않는다.

```json
{
  "projectId": "prj_123",
  "items": [
    {
      "reviewId": "rvw_123",
      "direction": "CLIENT_TO_FREELANCER",
      "rating": 5,
      "content": "요구사항을 명확히 전달해 주셨습니다.",
      "tags": ["WORK_QUALITY"],
      "visibility": "PUBLISHED",
      "submittedAt": "2026-09-04T08:00:00Z"
    }
  ]
}
```

에러: 401. 404.

## GET /api/v1/projects/:projectId/reviews/me — `getMyProjectReview`

규칙 9·11. 작성 가능 상태. 상대가 공개 전이면 존재·별점·본문을 반환하지 않는다.

```json
{
  "canReview": true,
  "reason": null,
  "reviewDeadlineAt": "2026-09-18T08:00:00Z",
  "myReview": null,
  "counterpartyReviewVisibility": "NOT_AVAILABLE"
}
```

`reason`은 `PROJECT_NOT_COMPLETED` · `REVIEW_FORBIDDEN` · `REVIEW_ALREADY_SUBMITTED` ·
`REVIEW_PERIOD_CLOSED` 또는 null. 에러: 401. 404.

## GET /api/v1/users/:userId/rating — `getUserRating`

규칙 7. 공개분만. 프로젝트 목록은 값을 가공하지 않는다.
오케스트레이션 조회 이름은 `getUserRatingSummary`이며 이 핸들러와 같다. 새 HTTP 없음.

```json
{ "userId": "usr_freelancer_b", "averageRating": 4.5, "reviewCount": 2 }
```

없으면 `averageRating: null`, `reviewCount: 0`. 에러: 401. 404.

## GET /api/v1/users/:userId/reviews — `listUserReviews`

`PUBLISHED`만. `publishedAt DESC, reviewId DESC`. `page` 1~1000, `pageSize` 1~50(기본 20).

```json
{ "items": [], "page": 1, "pageSize": 20, "totalCount": 0, "totalPages": 0 }
```

에러: 401. 404.

## 내부 조회 — `getPublishedRatingAggregate`

브라우저 API가 아니다. 오민혁이 `REVIEW_CREATED` 후 호출. HTTP는 팀장.

```ts
getPublishedRatingAggregate(revieweeId: string): Promise<{ ratingSum: number; reviewCount: number }>
```

공개분만. 0건이면 `{ ratingSum: 0, reviewCount: 0 }`. 반올림 없음. `/rating` 평균의 정본.
오케스트레이션 `getUserRatingSummary`는 브라우저 `getUserRating`과 이 합계의 별칭이다.
F06: `review_windows`를 잠근 뒤 재조회. F07·F12: `user_rating_projections`와
`displayAverageRating(sum, count)` (489/110=4.4). 새 HTTP 없음.

PATCH/PUT/DELETE 없음 → 405 `METHOD_NOT_ALLOWED`.

## DTO

```ts
type ReviewDirection = 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT';
type ReviewVisibility = 'BLINDED' | 'PUBLISHED';
type ClientToFreelancerTag =
  | 'WORK_QUALITY' | 'ON_TIME_DELIVERY' | 'GOOD_COMMUNICATION'
  | 'REQUIREMENT_UNDERSTANDING' | 'PROFESSIONAL_ATTITUDE';
type FreelancerToClientTag =
  | 'CLEAR_REQUIREMENTS' | 'FAST_FEEDBACK' | 'GOOD_COMMUNICATION'
  | 'SCOPE_STABILITY' | 'PROFESSIONAL_ATTITUDE';
type ReviewTag = ClientToFreelancerTag | FreelancerToClientTag;
type CreateReviewInput = { rating: 1|2|3|4|5; content?: string; tags: ReviewTag[] };
type ReviewItem = {
  reviewId: string; direction: ReviewDirection; rating: number;
  content: string | null; tags: ReviewTag[]; visibility: ReviewVisibility; submittedAt: string;
};
type CreateReviewResponse = ReviewItem & {
  projectId: string; contractId: string; reviewerId: string; revieweeId: string; editable: false;
};
type GetMyProjectReviewResponse = {
  canReview: boolean;
  reason: 'PROJECT_NOT_COMPLETED'|'REVIEW_FORBIDDEN'|'REVIEW_ALREADY_SUBMITTED'|'REVIEW_PERIOD_CLOSED'|null;
  reviewDeadlineAt: string | null;
  myReview: CreateReviewResponse | null;
  counterpartyReviewVisibility: 'NOT_AVAILABLE' | 'PUBLISHED';
};
type GetUserRatingResponse = { userId: string; averageRating: number | null; reviewCount: number };
type ListUserReviewsResponse = {
  items: ReviewItem[]; page: number; pageSize: number; totalCount: number; totalPages: number;
};
```
