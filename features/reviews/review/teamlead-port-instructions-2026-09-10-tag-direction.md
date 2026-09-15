# reviews 이식 지시서 — R4 태그 방향 축소 (2026-09-10)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (reviews) |
| 근거 | feedback 9/9 R4 · [api-contract.md](../api-contract.md) `GET .../reviews/me` |
| 목적 | 작성 화면이 두 방향 태그를 한꺼번에 보여 「업무 태도」로 고정되던 한계를 없앰 |

`app/`은 팀장님만 수정합니다. **서버가 이미 방향을 알고 있는데 응답에 안 주고
있었습니다.** 원본·계약을 `myDirection`으로 고쳤습니다 — app/에 그대로 옮기면 됩니다.

차단 이슈는 아닙니다(잘못된 태그는 서버 422). UX·라벨 정확도를 위한 후속입니다.

---

## 1. 응답에 `myDirection` 추가 (서버)

**원본** `features/reviews/prototype/server/review.service.ts` `getMyProjectReview` —
이미 `direction`을 계산합니다. 반환에 넣기만 하면 됩니다.

```ts
  return {
    canReview: reason === null,
    reason,
    reviewDeadlineAt: reviewDeadlineAt(window),
    myDirection: direction, // 당사자면 CLIENT_TO_FREELANCER | FREELANCER_TO_CLIENT, 아니면 null
    myReview: mine ? toCreateBody(...) : null,
    counterpartyReviewVisibility: counterpartPublic ? 'PUBLISHED' : 'NOT_AVAILABLE',
  };
```

**파일**
- `app/server/.../review.types.ts` — `GetMyProjectReviewResponse`에
  `myDirection: ReviewDirection | null`
- `app/server/.../review.service.ts` — 위 한 줄
- (선택) in-memory 타입이 있으면 같이

계약 예시·DTO는 `features/reviews/api-contract.md`에 반영해 두었습니다.

---

## 2. 웹 — `/me`를 읽고 태그를 가른다

### 2-1. API·훅

`app/web/src/features/reviews/api/review.ts`에:

```ts
export function fetchMyProjectReview(projectId: string): Promise<GetMyProjectReviewResponse> {
  return http.get(`/v1/projects/${encodeURIComponent(projectId)}/reviews/me`);
}
```

`useReviews.ts`에 `useMyProjectReview(projectId)` (기존 `useProjectReviews`와 같은 패턴).

### 2-2. `ReviewPage.tsx` — ALL_TAGS 제거

원본 라벨표 (`prototype/web/review.view-model.ts`):

| direction | 태그 상수 | `PROFESSIONAL_ATTITUDE` 라벨 |
|---|---|---|
| `CLIENT_TO_FREELANCER` | `CLIENT_TO_FREELANCER_TAGS` | 업무 태도가 전문적이에요 |
| `FREELANCER_TO_CLIENT` | `FREELANCER_TO_CLIENT_TAGS` | 협업 태도가 전문적이에요 |

```ts
const CLIENT_TAG_LABEL = { /* WORK_QUALITY … PROFESSIONAL_ATTITUDE: '업무 태도가…' */ };
const FREELANCER_TAG_LABEL = { /* CLEAR_REQUIREMENTS … PROFESSIONAL_ATTITUDE: '협업 태도가…' */ };

function tagsForDirection(direction: ReviewDirection | null) {
  if (direction === 'CLIENT_TO_FREELANCER') {
    return CLIENT_TO_FREELANCER_TAGS.map((code) => ({ code, label: CLIENT_TAG_LABEL[code] }));
  }
  if (direction === 'FREELANCER_TO_CLIENT') {
    return FREELANCER_TO_CLIENT_TAGS.map((code) => ({ code, label: FREELANCER_TAG_LABEL[code] }));
  }
  return [];
}
```

작성 폼은 `me.canReview === true`일 때만 태그 칩을 그립니다.
`myDirection === null`이면 칩 없음(비당사자·금지).

파일 상단 주석의 「두 방향 모두 보여주고 422」 절충 설명은 지우고, `/me`의
`myDirection`을 쓴다고 바꿔 주세요.

### 2-3. (권장) `reason`으로 빈 화면

지금처럼 제출 실패 코드에만 의존하지 말고, `canReview === false`면
`PROJECT_NOT_COMPLETED` / `REVIEW_ALREADY_SUBMITTED` / `REVIEW_PERIOD_CLOSED` /
`REVIEW_FORBIDDEN` 문구를 `/me` 단계에서 보여 주면 시안과 더 가깝습니다.
필수는 아니고 태그 축소와 같이 하면 왕복이 한 번으로 끝납니다.

---

## 3. 검증

- 의뢰인으로 열기 → 태그 5개 = 클라이언트→프리랜서, 「업무 태도」
- 프리랜서로 열기 → 태그 5개 = 프리랜서→의뢰인, 「협업 태도」
- 상대 방향 태그를 강제로 POST하면 여전히 422 `REVIEW_TAG_INVALID`
- `npx tsx features/reviews/prototype/run.tsx` — 원본 PASS (myDirection 단언 포함)

---

## 같이 고치지 않아도 되는 것

- 서버 태그 검증·`createReview` 방향 판정 — 이미 세션 기준
- DB 스키마 — 변경 없음
