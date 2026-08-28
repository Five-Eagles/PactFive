# reviews — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다.
브라우저. `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
설계 초안(규칙 9·7). Mock은 다음 스프린트.

## POST /api/v1/projects/:projectId/reviews — `createReview`

규칙 1~4·8·10. 당사자. `COMPLETED`만. 본문에 `direction`·`contractId` 없음.

요청:

```json
{
  "rating": 5,
  "comment": "일정과 품질이 좋았습니다.",
  "tags": ["RESPONSIBILITY", "DELIVERABLE_QUALITY"]
}
```

응답 201:

```json
{
  "reviewId": "rvw_123",
  "projectId": "prj_123",
  "contractId": "ctr_123",
  "reviewerId": "usr_client_a",
  "revieweeId": "usr_freelancer_b",
  "direction": "CLIENT_TO_FREELANCER",
  "rating": 5,
  "comment": "일정과 품질이 좋았습니다.",
  "tags": ["RESPONSIBILITY", "DELIVERABLE_QUALITY"],
  "isPublic": false,
  "createdAt": "2026-08-28T04:00:00Z"
}
```

같은 `Idempotency-Key` + 같은 본문 재호출은 200, 기존 행. 다른 본문은 409.
이미 같은 방향이 있으면 409.

에러: 401. 403 비당사자. 404. 409 `REVIEW_ALREADY_EXISTS` · `TRANSACTION_NOT_COMPLETED` ·
`PROJECT_TRANSITION_CONFLICT`(취소). 422 `rating`·`tags`.

---

## GET /api/v1/projects/:projectId/reviews — `listProjectReviews`

규칙 5·6·9. 당사자는 본인 미공개 + 공개된 양쪽. 비당사자는 `isPublic: true`만.

응답 200:

```json
{
  "projectId": "prj_123",
  "items": [
    {
      "reviewId": "rvw_123",
      "direction": "CLIENT_TO_FREELANCER",
      "rating": 5,
      "comment": "일정과 품질이 좋았습니다.",
      "tags": ["RESPONSIBILITY", "DELIVERABLE_QUALITY"],
      "isPublic": true,
      "createdAt": "2026-08-28T04:00:00Z"
    }
  ]
}
```

상대 미공개 행은 `items`에 넣지 않는다. 빈 목록은 `items: []`.

에러: 401. 404.

---

## GET /api/v1/users/:userId/review-summary — `getReviewSummary`

규칙 7. 공개된 리뷰만. 인증 필요. 프로젝트 목록은 값을 가공하지 않는다.

응답 200:

```json
{
  "userId": "usr_freelancer_b",
  "averageRating": 4.5,
  "reviewCount": 2
}
```

공개 리뷰가 없으면 `averageRating: null`, `reviewCount: 0`.

에러: 401. 404.

---

PATCH/PUT/DELETE `/reviews` 없음 (규칙 4).

---

## DTO

```ts
type ReviewDirection = 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT';
type ClientToFreelancerTag =
  | 'RESPONSIBILITY'
  | 'COMMUNICATION'
  | 'TECHNICAL_SKILL'
  | 'SCHEDULE_COMPLIANCE'
  | 'DELIVERABLE_QUALITY';
type FreelancerToClientTag =
  | 'REQUIREMENT_CLARITY'
  | 'COMMUNICATION'
  | 'FEEDBACK_SPEED'
  | 'SCOPE_STABILITY'
  | 'PAYMENT_RELIABILITY';
type ReviewTag = ClientToFreelancerTag | FreelancerToClientTag;

type CreateReviewInput = {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  tags: ReviewTag[];
};
type ReviewItem = {
  reviewId: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  tags: ReviewTag[];
  isPublic: boolean;
  createdAt: string;
};
type CreateReviewResponse = ReviewItem & {
  projectId: string;
  contractId: string;
  reviewerId: string;
  revieweeId: string;
};
type ListProjectReviewsResponse = {
  projectId: string;
  items: ReviewItem[];
};
type GetReviewSummaryResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
};
```
