# reviews — 2026-09-11 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| `npx tsx features/reviews/prototype/run.tsx` | **PASS 69 / FAIL 0** |
| 격리 audit probes (`audit-probes.mjs`) | **30 PASS / 1 FAIL** (T04=A-02 보류) |
| 그중 reviews 관련 T16–T29 · T23–T27 | **전부 PASS** (R-02/R-03/R-08 포함) |
| CR-CP-003 증거 T13 | **PASS** (멱등 payload DB) |
| API 스모크 (`reviews-api-smoke.json`) | **7 PASS / 0 FAIL** |

### API 스모크 (seed `payment-ready`, COMPLETED 전)

| 케이스 | 결과 |
|---|---|
| R-02 `PATCH .../reviews` | PASS **405** |
| 의뢰인 `GET .../reviews/me` | PASS `canReview=false` · `PROJECT_NOT_COMPLETED` · `myDirection=CLIENT_TO_FREELANCER` |
| 프리랜서 `/me` | PASS `myDirection=FREELANCER_TO_CLIENT` |
| 프로젝트 리뷰 목록 | PASS items=0 |
| `GET /users/:id/rating` | PASS avg=null · count=0 |
| `GET /users/:id/reviews` | PASS items=0 |
| POST(미완료) | PASS **409** `PROJECT_NOT_COMPLETED` |

작성·422 content는 거래 COMPLETED 후에만 실측 가능 — Toss confirm + `simulate-settlement` 수동.

## 2. 문서

- 현황판 머지 중복 정리 · #1·#3 닫음
- 스모크 스크립트: `features/reviews/review/reviews-api-smoke.mjs`

## 3. 잔여

| ID | 내용 | 제안 |
|---|---|---|
| **Toss → COMPLETED** | paymentKey + 정산 시뮬 | 시드 안내 수동 |
| **R-03 live 422** | content typeof | COMPLETED 후 재스모크 |
| **A-02** | 프로필 게이트 | 보류 |
| **화면 R4** | 방향 태그 브라우저 | 선택 QA |

reviews P0(R-02/R-03/R-08 등)는 develop 격리 probe로 유지 확인.
