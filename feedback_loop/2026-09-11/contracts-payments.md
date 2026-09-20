# contracts-payments — 2026-09-11 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| `npx tsx features/contracts-payments/prototype/run.tsx` | **PASS 347 / FAIL 0** |
| API 스모크 (`contracts-payments-api-smoke.json`) | **6 PASS / 0 FAIL** |

### API 스모크 (seed `payment-ready`)

| 케이스 | 결과 |
|---|---|
| C-07 프리랜서 `POST /payments` | PASS **403** `PROJECT_FORBIDDEN` |
| 의뢰인 `GET /payments/:id` | PASS READY |
| 의뢰인 prepare 멱등 | PASS 200 |
| 프리랜서 결제 조회(당사자) | PASS 200 |
| 계약·합의 현황 | PASS SIGNED / ACCEPTED |

## 2. 문서

- 현황판 머지 중복본 정리 · #1 닫음 · #3=CR-CP-003 유지
- CR-CP-003은 **제안** 상태(payload·복합 PK) — app 팀장 작업

## 3. 잔여

| ID | 내용 | 제안 |
|---|---|---|
| **CR-CP-003** | 멱등 응답 payload DB 영속 | 팀장 스키마+배선 |
| **A-02** | 프로필 게이트 | 보류 |
| **실 Toss confirm** | paymentKey | 수동 샌드박스 (seed 안내) |

P0(C-01/C-06/C-07/C-08/C-10/C-11/C-13 등)는 develop 반영분으로 격리·스모크 통과.
