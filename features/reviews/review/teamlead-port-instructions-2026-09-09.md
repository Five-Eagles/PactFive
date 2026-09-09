# reviews 이식 지시서 (2026-09-09)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (reviews) |
| 목적 | 판단할 것을 남기지 않은 이식 지시 |
| 대체 | `teamlead-review-panel-api-2026-09-03.md` (폐기된 `review-summary`·PASS 40 기준) |

`app/`은 팀장님만 수정하므로 제가 커밋하지 않습니다. **어디를 어떻게 바꾸는가**만 적었습니다.

**배경.** `app/server/src/features/reviews/`는 2026-09-05 이식본인데 2026-09-07에 설계서
v2.0으로 계약이 바뀌었습니다. 지금 `app/`은 폐기된 계약을 구현하고 있습니다. 원본은
`run.tsx` PASS 69 / FAIL 0입니다. 우선순위는 **1 → 2 → 3 → 4**이고, 4번만 `CR-RV-002`
승인이 선행조건입니다.

**이미 맞는 것 (건드리지 마세요).** 2026-09-08 통합의 두 가지는 원본과 일치합니다 —
`review_created_published_at`(`schema.prisma:936`) + `publishNewlyPublic`
(`review.service.ts:107~121`), `review_idempotency_keys`(`:952`) +
`getIdempotency`/`setIdempotency`.

---

## 1. 태그 코드 10종 · 필드명

### 1-1. 태그 코드 — `review.constants.ts:6~20`

구 E-19를 v2.0으로 바꿉니다([api-contract.md](../api-contract.md) `:124~129`).

```ts
 export const CLIENT_TO_FREELANCER_TAGS = [
-  'RESPONSIBILITY', 'COMMUNICATION', 'TECHNICAL_SKILL',
-  'SCHEDULE_COMPLIANCE', 'DELIVERABLE_QUALITY',
+  'WORK_QUALITY', 'ON_TIME_DELIVERY', 'GOOD_COMMUNICATION',
+  'REQUIREMENT_UNDERSTANDING', 'PROFESSIONAL_ATTITUDE',
 ] as const;

 export const FREELANCER_TO_CLIENT_TAGS = [
-  'REQUIREMENT_CLARITY', 'COMMUNICATION', 'FEEDBACK_SPEED',
-  'SCOPE_STABILITY', 'PAYMENT_RELIABILITY',
+  'CLEAR_REQUIREMENTS', 'FAST_FEEDBACK', 'GOOD_COMMUNICATION',
+  'SCOPE_STABILITY', 'PROFESSIONAL_ATTITUDE',
 ] as const;
```

`GOOD_COMMUNICATION`·`PROFESSIONAL_ATTITUDE`는 **양방향에 같은 코드**로 들어갑니다.

### 1-2. 한글 라벨 (ERD 확인 요청 회신)

[erd.md](../../../docs/domain/erd.md) `:638~640`이 「`features/reviews/` 어디에도 한글 라벨이
없다」고 적었는데 **`prototype/web/review.view-model.ts:61~75`에 있습니다.** 화면 문구라
`web/` 아래에 두었습니다. `app/web`의 `TAG_LABEL`(`ReviewPage.tsx:28~38`)을 이 표로 바꿉니다.

| 방향 | 코드 | 한글 라벨 |
|---|---|---|
| 의뢰인 → 프리랜서 | `WORK_QUALITY` | 결과물 품질이 좋아요 |
| 의뢰인 → 프리랜서 | `ON_TIME_DELIVERY` | 납기를 잘 지켜요 |
| 의뢰인 → 프리랜서 | `GOOD_COMMUNICATION` | 소통이 원활해요 |
| 의뢰인 → 프리랜서 | `REQUIREMENT_UNDERSTANDING` | 요구사항 이해가 정확해요 |
| 의뢰인 → 프리랜서 | `PROFESSIONAL_ATTITUDE` | 업무 태도가 전문적이에요 |
| 프리랜서 → 의뢰인 | `CLEAR_REQUIREMENTS` | 요구사항이 명확해요 |
| 프리랜서 → 의뢰인 | `FAST_FEEDBACK` | 피드백이 빨라요 |
| 프리랜서 → 의뢰인 | `GOOD_COMMUNICATION` | 소통이 원활해요 |
| 프리랜서 → 의뢰인 | `SCOPE_STABILITY` | 업무 범위가 안정적이에요 |
| 프리랜서 → 의뢰인 | `PROFESSIONAL_ATTITUDE` | 협업 태도가 전문적이에요 |

`GOOD_COMMUNICATION`은 양쪽 라벨이 같지만 `PROFESSIONAL_ATTITUDE`는 **다릅니다**
(「업무 태도」/「협업 태도」). 코드가 같아도 라벨은 방향별로 골라야 합니다.

### 1-3. `comment` → `content`, `isPublic` → `visibility`

`comment`는 이름만 바뀌지만 `isPublic`은 **타입이 바뀝니다** — boolean이 아니라
`'BLINDED' | 'PUBLISHED'`입니다. 변환 함수 `visibilityOf`는 원본 `:58~60`에 한 줄로 있습니다.

- `toItem`(`review.service.ts:77~87`) — `comment`·`isPublic`·`createdAt` →
  `content`·`visibility`·`submittedAt`. `submittedAt`은 **이름만** 바뀝니다(값은 `row.createdAt`)
- `toCreateBody`(`:89~97`) — `editable: false` 추가
- `bodyHash`(`:42~48`) — `comment: input.comment ?? null`을 `content`로. **안 바꾸면 해시가
  항상 `null`로 계산돼 본문이 다른 요청이 같은 키로 통과합니다**
- `app/web/src/features/reviews/review.types.ts:38~52`도 같이

---

## 2. 화면에 잘못된 값이 나가는 것

### 2-1. `displayAverageRating`이 없다 — `review.service.ts:257~261`

```ts
-  return { userId, averageRating: ratingSum / reviewCount, reviewCount };
+  return { userId, averageRating: displayAverageRating(ratingSum, reviewCount), reviewCount };
```

`app/server/src/features/reviews/display-average.ts`를 새로 만듭니다(원본 전문):

```ts
/** 합계/건수에서 바로 한 자리로 반올림한다. 4.45를 다시 반올림하지 않는다. */
export function displayAverageRating(ratingSum: number, reviewCount: number): number | null {
  if (reviewCount <= 0) return null;
  return Math.round((ratingSum / reviewCount) * 10) / 10;
}
```

**핵심은 두 번 반올림하지 않는 것입니다.** 합계 489·건수 110이면 489/110 = 4.4454…이고
한 번에 한 자리로 반올림하면 **4.4**입니다. 둘째 자리로 먼저 4.45를 만들고 다시 반올림하면
**4.5**가 됩니다. 별점 한 칸이 틀립니다. `run.tsx` F12의 반례입니다.

### 2-2. 에러 코드가 계약과 다르다 — `review.service.ts`

| 위치 | 현재 | 바꿀 것 | HTTP |
|---|---|---|---|
| `:140` | `PROJECT_FORBIDDEN` | `REVIEW_FORBIDDEN` | 403 |
| `:147` | `TRANSACTION_NOT_COMPLETED` | `PROJECT_NOT_COMPLETED` | 409 |
| `:167` | `REVIEW_ALREADY_EXISTS` | `IDEMPOTENCY_KEY_REUSED` | 409 |
| `:180` | `REVIEW_ALREADY_EXISTS` | `REVIEW_ALREADY_SUBMITTED` | 409 |
| `:153` | `VALIDATION_ERROR` (rating) | `INVALID_REVIEW_RATING` | 400 |
| `:56`·`:62` | `VALIDATION_ERROR` (tags) | `REVIEW_TAG_INVALID` | 422 |

**`:167`과 `:180`이 같은 코드인 것이 문제입니다.** 앞은 「같은 키로 다른 본문」, 뒤는
「같은 방향 두 번째 리뷰」인데 화면이 둘을 구분할 수 없습니다.

`:134`(`idempotencyKey` 누락)는 `VALIDATION_ERROR`로 그대로 둡니다 — 원본도 같습니다.

`:143`의 취소 분기는 원본에서 별도 코드가 아니라 합쳐져 있습니다(원본 `:163~168`).
`PROJECT_TRANSITION_CONFLICT`를 지우고 `transactionStatus !== 'COMPLETED' ||
contractStatus === 'CANCELED'` 한 덩어리로 `PROJECT_NOT_COMPLETED`를 던집니다.

### 2-3. 본문 길이 검증이 없다

`app/`에는 아예 없습니다. 원본 `normalizeContent`(`:47~56`)를 그대로 옮깁니다 — trim 후
1~1,000자가 아니면 422 `REVIEW_CONTENT_INVALID`입니다. `undefined`는 통과(본문 없는 리뷰
허용)이고 **공백만 있는 문자열은 422**입니다(trim 후 0자).

---

## 3. 라우트 3종 → 5종 — `review.router.ts`

| 계약 경로 | 핸들러 | app 상태 |
|---|---|---|
| `POST /api/v1/projects/:projectId/reviews` | `createReview` | 있음 (`:31`) |
| `GET /api/v1/projects/:projectId/reviews` | `listProjectReviews` | 있음 (`:41`) |
| `GET /api/v1/projects/:projectId/reviews/me` | `getMyProjectReview` | **없음** |
| `GET /api/v1/users/:userId/rating` | `getUserRating` | `review-summary`(`:47`) 대체 |
| `GET /api/v1/users/:userId/reviews` | `listUserReviews` | **없음** |

- **`review-summary` → `rating`.** 경로만이 아닙니다. `averageRating`이 2-1을 거쳐야 합니다.
  함수명 `getReviewSummary` → `getUserRating`, 별칭 `getUserRatingSummary`를 같은 핸들러로
  export(원본 `:355`)
- **`reviews/me`** — 원본 `:272~315`. 응답 5필드는 [api-contract.md](../api-contract.md)
  `:66~81`. **상대가 공개 전이면 존재·별점·본문을 주지 않고** `NOT_AVAILABLE`만
- **`users/:userId/reviews`** — 원본 `:357~390`. `PUBLISHED`만, `publishedAt DESC,
  reviewId DESC`, `page` 1~1000 · `pageSize` 1~50(기본 20). 정렬 키는
  `reviewCreatedPublishedAt ?? createdAt`
- `me`를 `reviews` 앞에 등록하는 편이 경로 혼동이 없습니다
- **405** — `:6~12` 주석대로 지금은 404입니다. 계약은 405
  ([api-contract.md](../api-contract.md) `:117`, 원본 판정 함수 `:136~140`). **급하지
  않습니다** — 404도 안전한 기본값이라 나중에 붙이셔도 됩니다

**웹 라우트 복수형** — `review.routes.tsx:9`·`:13`의 `/projects/${projectId}/review`를
`/reviews`로. **applications 지시서 3-3과 짝입니다.** 프리랜서 「완료됨」 배지 CTA가
`/projects/:projectId/reviews`로 가고 그것이 프리랜서의 유일한 리뷰 진입 경로입니다. 두
곳이 어긋나면 CTA가 404입니다. `api/review.ts:29`의 `review-summary` 호출도 함께.

---

## 4. 14일 판정 기준 (CR-RV-002 승인 후)

`review.service.ts:68~75`는 리뷰 행의 작성 시각(`row.createdAt`)에서 14일을 셉니다. 규칙 6의
기준은 **프로젝트 최초 `completedAt`** 입니다. 원본은 `review_windows`에 `openedAt` =
`completedAt`, `deadlineAt` = `openedAt + 14일`을 고정하고 `now >= deadlineAt`으로
판정합니다(`prototype/mock/review.mock.ts:228~242`, 원본 `:62~75`).

**차이가 드러나는 경우.** 한쪽이 완료 직후, 다른 쪽이 열흘 뒤에 썼다면 지금 구현은 두 행의
공개 시점이 열흘 어긋납니다. window 기준이면 같은 `deadlineAt`에 함께 공개됩니다. 단독
공개는 프로젝트 단위 사건이라 행마다 달라질 수 없습니다.

함께 붙는 것:

- **`REVIEW_PERIOD_CLOSED`** — 기한 후 작성은 409(원본 `:218~221`). 지금 `app/`에는 이
  판정이 없어 **14일이 지나도 리뷰를 계속 받습니다**
- **`reviewDeadlineAt`** — `reviews/me` 응답 필드. window 없이는 줄 값이 없습니다
- **`ensureWindow`는 `completedAt` 없이 부르면 예외**입니다. 원본은 `transactionStatus`가
  `COMPLETED`일 때만 부릅니다(`:260`·`:284~286`) — 이 가드를 같이 옮기셔야 합니다

**선행조건.** `review_windows`·`user_rating_projections`가 ERD·`schema.prisma`에 없습니다.
`CR-RV-002` 승인 후 시작하시고, 그전까지 `createdAt` 기준으로 두셔도 1~3번과 충돌하지
않습니다. `getUserRating`은 projection이 있으면 그 값을, 없으면 실시간 합계를 쓰므로(원본
`:345~347`) projection 없이도 정확한 값이 나옵니다.

## 확인이 필요한 것

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| R1 | 1~3번을 `CR-RV-002` 승인과 무관하게 먼저 반영하시는가 | | | |
| R2 | 405를 이번에 붙이시는가 | | | |
| R3 | 웹 경로 복수형을 applications 「완료됨」 CTA와 같은 슬라이스에서 하시는가 | | | |
| R4 | 태그 한글 라벨을 `app/web` 상수로 두시는가, 서버가 내려주시는가 | | | |

R4만 부연합니다. 원본은 라벨을 화면에 두었습니다. 서버가 내려주는 방식으로 바꾸시려면
계약에 필드가 늘어나므로 알려주세요 — `api-contract.md`를 고쳐야 합니다.
