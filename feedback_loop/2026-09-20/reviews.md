# reviews — 2026-09-14 발견 · 2026-09-20 콜드 검증 (조준영)

## 1. 로컬 QA (2026-09-20)

| 검증 | 결과 |
|---|---|
| `origin/develop` merge | `#132`까지 sync |
| 서버 콜드 재시작 후 스모크 | **8 PASS / 0 FAIL** (R-06 포함) |
| `npx tsx features/reviews/prototype/run.tsx` | **PASS 69 / FAIL 0** |

### API 스모크 상세 (콜드)

| 케이스 | 결과 |
|---|---|
| **R-06** 의뢰인만 세션 → 프리랜서 rating | PASS **200** count=0 |
| R-02 PATCH 405 | PASS |
| `/me` myDirection (의뢰인·프리랜서) | PASS |
| rating / user reviews | PASS |
| 미완료 POST | PASS **409** `PROJECT_NOT_COMPLETED` |

## 2. R-06 수정

의뢰인만 로그인한 채 `GET /users/:freelancerId/rating` → 예전 **404 USER_NOT_FOUND**.

원인: `userExistsPort`가 `roleByUserId` 캐시만 조회.
조치: Prisma `users` 조회로 정본화.

- 지시서: [teamlead-port-instructions-2026-09-14-r06-user-exists.md](../../features/reviews/review/teamlead-port-instructions-2026-09-14-r06-user-exists.md)
- 코드: `app/server/src/express-app.ts`

## 3. 잔여

| ID | 내용 | 상태 |
|---|---|---|
| **R-06** | userExists DB | **완료** (콜드 검증) |
| **Toss→COMPLETED** | 작성·R-03 422 | 수동 |
| **A-02** | 프로필 게이트 | develop에 프로필 화면(#127/#128) — 차단 모드 여부는 별도 확인 |
| **R4 화면** | 브라우저 태그 | 선택 |
