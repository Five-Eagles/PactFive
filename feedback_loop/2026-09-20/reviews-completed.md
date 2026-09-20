# reviews — 2026-09-20 후속 (COMPLETED 경로)

## 추가 발견 · 수정

### bodyHash → DB `VarChar(64)` 불일치
`createReview`가 `body_hash`에 JSON 원문을 넣어 P2000 LengthMismatch → 요청 hang.
applications와 같이 **sha256 hex**로 통일 (`app` + prototype).

### 로컬 Toss 우회
`POST /api/internal/dev/simulate-payment-paid` — READY→PAID + Coordinator start  
(비프로덕션 only, `simulate-settlement`와 동일 게이트)

## 스모크

| 검증 | 결과 |
|---|---|
| R-06 콜드 | 8/8 (PR #135) |
| COMPLETED 경로 (`reviews-completed-smoke.mjs`) | **4/4** — R-03 422 · createReview **201** PUBLISHED |
| prototype | **69 PASS** |

## 잔여
- 실 Toss 위젯 confirm은 여전히 수동(시드 문서)
- A-02 차단 모드 미적용 유지
