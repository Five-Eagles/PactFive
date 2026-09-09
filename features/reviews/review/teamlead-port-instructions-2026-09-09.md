# reviews 재이식 지시서 (2026-09-09)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (reviews) |
| 목적 | `app/`의 reviews를 설계서 v2.0 계약으로 맞추는 이식 지시 |

`app/`은 팀장님만 수정하므로 제가 커밋하지 않습니다.

**이 문서는 개별 CR이 아니라 한 건의 재이식 요청입니다.** `app/`의 reviews가 2026-09-05
이식본에서 멈춰 있어 그 뒤 확정된 설계서 v2.0 계약이 반영되지 않았습니다. 항목별로 CR을
쪼개면 15건이 되고 서로 물려 있어 따로 처리할 수 없습니다.

## 선행 조건 — CR-RV-002가 먼저입니다

[CR-RV-002](../change-requests/0002-review-window-and-rating-projection.md)의
`review_windows` · `user_rating_projections` 두 테이블이 스키마에 없으면 아래 3번·6번을
이식할 수 없습니다. 그 CR이 아직 `제안` 상태입니다.

나머지 항목(1·2·4·5·7)은 선행 조건 없이 지금 진행할 수 있습니다.

---

## 1. 태그 코드가 폐기된 것을 쓰고 있다 (사용자에게 보임)

**파일** `app/server/src/features/reviews/review.constants.ts:6~20`

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

**ERD는 이미 v2입니다** — `docs/domain/erd.md:630`에 「E-38 개정 — CR-RV-001」로 반영
기록이 있습니다. 계약은 `api-contract.md:124~130`. 즉 `app/` 코드만 남았습니다.

웹 표시명도 같이 바꿔야 합니다 — `app/web/src/features/reviews/ReviewPage.tsx:29~38`,
`review.types.ts:9`·`:23`. 표시명은 `spec.md:31~34`에 있습니다.

**증상** 화면에 폐기된 태그(「책임감」·「기술력」·「대금 지급 신뢰도」)가 뜨고, 계약대로
새 코드를 보내는 클라이언트는 422를 받습니다.

---

## 2. 요청·응답 필드와 에러 코드가 계약과 다르다

**필드** — `app/`은 `comment`·`isPublic`을 쓰고 `editable`이 없습니다. 계약은
`content`·`visibility`·`editable`입니다(`api-contract.md:131~138`).

- `comment` → `content`
- `isPublic: boolean` → `visibility: 'BLINDED' | 'PUBLISHED'`
- `editable` 추가

`visibility`는 단순 개명이 아닙니다. `BLINDED`는 「상대가 아직 안 써서 가려진 상태」라는
뜻이고 `isPublic: false`는 그 이유를 담지 못합니다.

**에러 코드** — `app/server/.../review.service.ts:140~180`을 계약(`api-contract.md:37~41`)
쪽으로 맞춥니다.

- `TRANSACTION_NOT_COMPLETED` → `PROJECT_NOT_COMPLETED`
- `REVIEW_ALREADY_EXISTS` → `REVIEW_ALREADY_SUBMITTED`
- `PROJECT_FORBIDDEN` → `REVIEW_FORBIDDEN`
- `VALIDATION_ERROR` → 값에 따라 `INVALID_REVIEW_RATING` · `REVIEW_TAG_INVALID` ·
  `REVIEW_CONTENT_INVALID`로 나눔
- `IDEMPOTENCY_KEY_REUSED` 추가 (같은 키·다른 본문)
- `PROJECT_TRANSITION_CONFLICT`는 계약에 없음 — 위 코드들로 흡수

`app/web`이 자체 코드 매핑으로 문구를 띄우고 있어(`ReviewPage.tsx:124~142`) 화면은 지금도
뜹니다. 코드를 바꿀 때 이 매핑도 같이 고쳐야 합니다.

---

## 3. 14일 판정 기준이 다르다 (선행: CR-RV-002)

**파일** `app/server/src/features/reviews/review.service.ts:68~75`

`app/`은 **각 리뷰 행의 `createdAt` + 14일**로 계산합니다.

```ts
return Date.parse(nowIso) - Date.parse(row.createdAt) >= SOLO_PUBLIC_AFTER_DAYS * DAY_MS;
```

원본은 **프로젝트 최초 `completedAt` 기준 window의 `deadlineAt`**을 봅니다
(`prototype/server/review.service.ts:62~76`).

```ts
if (!window) return false;
return Date.parse(nowIso) >= Date.parse(window.deadlineAt);
```

**차이가 실제로 생깁니다.** 거래 완료 10일 뒤에 쓴 리뷰는 원본에서 4일 후 공개되지만
`app/`에서는 14일 후 공개됩니다. 기준점이 프로젝트가 아니라 리뷰라서 사람마다 공개일이
달라집니다.

같은 window가 **작성 마감**도 정합니다. `app/`에는 `isPeriodClosed`와
`REVIEW_PERIOD_CLOSED`가 없어서(`rg` 결과 0건) **기한이 한참 지나도 작성이 통과합니다.**
원본은 `prototype/server/review.service.ts:81~84`·`:219~221`입니다.

---

## 4. 폐기된 경로가 서빙 중이고 새 경로 3개가 없다

**파일** `app/server/src/features/reviews/review.router.ts:31~53` (현재 3개 경로만)

- **`GET /users/:userId/review-summary` → `GET /users/:userId/rating`**
  `api-contract.md:8`이 `review-summary`를 폐기로 적었습니다. 웹도 같이 고쳐야 합니다 —
  `app/web/src/features/reviews/api/review.ts:29`
- **`GET /projects/:projectId/reviews/me` 신설** — 원본
  `prototype/server/review.service.ts:272~315`. `canReview`·`reason`·`reviewDeadlineAt`·
  `counterpartyReviewVisibility`를 돌려줍니다
- **`GET /users/:userId/reviews` 신설** — 원본 `:357~390`, 계약 `api-contract.md:94~101`.
  페이지네이션 포함
- **405 `METHOD_NOT_ALLOWED`** — 라우터 주석(`:6~11`)이 「404가 안전한 기본값이라 405를
  추가하지 않는다」고 적었습니다. 계약은 `api-contract.md:117`에서 405를 요구합니다.
  원본은 `assertReviewWriteMethod`(`prototype/server/review.service.ts:136~140`).
  급하지 않습니다

**`/reviews/me`가 없어서 생기는 문제** — 화면이 작성 가능 여부·마감일·상대 공개 여부를
서버에서 받지 못합니다. 그래서 `app/web`은 양방향 태그 10종을 **전부 보여주고** 서버 422에
의존합니다(`ReviewPage.tsx:19~24` 주석에 이 절충이 적혀 있습니다). 1번의 태그 교체만 하고
이 경로를 안 만들면, 사용자는 자기 방향이 아닌 태그를 골랐다가 거부당합니다.

---

## 5. 평균 평점이 반올림되지 않는다

**파일** `app/server/src/features/reviews/review.service.ts:261`

나눗셈 결과를 그대로 반환해서 `4.454545454545454`가 내려갑니다. 원본은
`prototype/server/display-average.ts`의 `displayAverageRating`으로 한 자리 반올림합니다
(`prototype/server/review.service.ts:351`).

F12 검증 케이스가 있습니다 — 489/110은 4.445…이지만 **직접 반올림해 4.4**입니다. 두 번
반올림하면 4.5가 되어 어긋납니다. `run.tsx`의 「F12: 489/110 직접 반올림은 4.4」가 이
케이스입니다.

---

## 6. 잠금·Projection이 없다 (선행: CR-RV-002)

- **`withKeyedLock`** — 원본 `prototype/server/keyed-lock.ts`, 사용은
  `prototype/server/review.service.ts:192`. `app/`의 `createReview`(`:124~205`)는 잠금 없이
  진행합니다. 양쪽이 동시에 첫 리뷰를 제출하면 공개 판정이 어긋날 수 있습니다
- **`refreshUserRatingProjection`** — 원본 `:392~405`. `user_rating_projections` 테이블이
  선행 조건입니다

---

## 7. 웹 라우트가 단수다

**파일** `app/web/src/features/reviews/review.routes.tsx:9`·`:13`

`/review` → `/reviews`. 계약 경로가 복수입니다.

**applications 쪽과 같이 처리해 주세요.** applications의 「완료됨」 배지가 리뷰 화면으로
링크할 때 이 경로를 씁니다
([applications 이식 지시서](../../applications/review/teamlead-port-instructions-2026-09-09.md)
3-3). 한쪽만 고치면 링크가 깨집니다.

---

## 8. 시안의 확인 모달·별점 radiogroup

`app/`은 숫자 텍스트 입력 + 즉시 제출입니다(`ReviewPage.tsx:190~199`·`:236~239`). 원본은
`role="dialog" aria-modal`(`prototype/web/ReviewPanel.tsx:100`)과
`role="radiogroup"`(`:133`)을 씁니다. 리뷰도 제출 후 수정이 안 되므로 확인이 필요합니다.

---

## 손대지 않는 것

- **`publishDueSoloReviews` 배치** — `app/`에 스케줄러가 없어 이 Increment 밖으로 고정
  (`index.md`). `isReviewPublic`이 조회마다 계산되므로 화면 공개 여부는 맞습니다
- **`getPublishedRatingAggregate` HTTP** — 구독하는 기능이 없어 의도적으로 열지 않음
  (`api-contract.md:105`·`:115`)

## 제가 회신을 기다리는 것

- **14일 확정** — `spec.md:54` 규칙 6이 아직 `(ASSUMPTION)`입니다.
  `../../contracts-payments/review/external-wait-2026-08-31.md` §2의 T1·T2가 8/26 요청 이후
  지금도 빈칸입니다. 다른 일수로 정하시면 `SOLO_PUBLIC_AFTER_DAYS` 한 값만 바꾸면 됩니다
- **`REVIEW_REQUESTED` 발송** — 규칙 12대로 저는 발행만 합니다. 어댑터가 큐에 쌓기만 해
  거래 완료 후 리뷰 요청 알림이 당사자에게 가지 않습니다
