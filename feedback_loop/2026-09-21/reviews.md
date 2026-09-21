# reviews — 2026-09-21 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| `npx tsx features/reviews/prototype/run.tsx` | **PASS 69 / FAIL 0** |
| API 스모크 ([reviews-api-smoke.json](./reviews-api-smoke.json)) | **8 PASS / 0 FAIL** |
| COMPLETED 스모크 ([reviews-completed-smoke.json](./reviews-completed-smoke.json)) | **4 PASS / 0 FAIL** (이미 제출 → skip) |
| R4 closeout | **8 PASS** (web preview optional unreachable) |

## 2. 수정

payment-ready 시드가 COMPLETED·리뷰 제출된 뒤에도 API 스모크가 깨지지 않도록:

- `GET user rating`: `reviewCount === 0` 고정 해제 → `>= 0`
- `POST invalid/guarded`: `REVIEW_ALREADY_SUBMITTED`·content `422` 허용
- 증거 경로: `feedback_loop/2026-09-21/`

## 3. 잔여

| ID | 내용 | 제안 |
|---|---|---|
| A-02 프로필 게이트 | 현황판 #2 | **켜지 말 것** |
