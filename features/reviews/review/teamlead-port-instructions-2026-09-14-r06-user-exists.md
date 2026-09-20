# reviews — userExists DB 정본 (R-06) · 2026-09-14

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (reviews) |
| 근거 | live 스모크: 의뢰인만 로그인한 채 `GET /users/:freelancerId/rating` → **404 USER_NOT_FOUND** |
| 목적 | 평점·공개 리뷰 목록이 “상대가 이 인스턴스에서 로그인한 적 있나”에 의존하지 않게 함 |

---

## 증상

`express-app.ts` reviews 배선:

```ts
userExistsPort: {
  async userExists(userId: string) {
    return roleByUserId.has(userId); // 토큰 검증으로만 채워지는 캐시
  },
},
```

`roleByUserId`는 **이 프로세스에서 requireAuth를 탄 사용자만** 들어간다.
의뢰인이 프리랜서 평점을 보면 프리랜서는 캐시에 없어 `USER_NOT_FOUND`(404)가 난다.
서버 재시작 직후 스모크에서 rating/목록만 간헐 FAIL이던 원인과 같다.

## 반영 (이미 feature/reviews에 넣음)

Prisma 구성 시 `users` 행을 정본으로 조회. 캐시는 히트 시 빠른 경로.

```ts
async userExists(userId: string) {
  if (roleByUserId.has(userId)) return true;
  if (!isPrismaConfigured(authProviderMode)) return false;
  const row = await getPrismaClient().user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });
  return Boolean(row && !row.deletedAt);
}
```

검증: `node features/reviews/review/reviews-api-smoke.mjs` — **R-06** 케이스
(의뢰인만 로그인 → 프리랜서 rating 200).

## 후속 (오민혁 / UM)

user-management가 `userExists(userId)` 포트를 공식 노출하면 이 인라인 조회를 그쪽으로 교체.
지금은 reviews 규칙 7 차단을 푸는 배선 수정이다.
