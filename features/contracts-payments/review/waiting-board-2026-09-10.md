# 대기 현황판 — 2026-09-10 (2026-09-20 plan 실행 후)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-20 — PR #135–137 머지 · R-001 합의 지시서 · R4 점검 |

원본 — applications 97 · reviews 69 · contracts-payments 347.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 2 | 프로필 게이트 꺼짐 | **RW 보류** (ADR-0014) | 오민혁 → 팀장 | **켜지 말 것** |
| R-001 | 지원 행↔건수 `$transaction` | **구현 PR** — UoW 배선 | 팀장 리뷰 | [지시서](../../applications/review/teamlead-port-instructions-2026-09-20-r001-transaction.md) |

## 닫은 것 (오늘)

| # | 항목 | 근거 |
|---|---|---|
| PR #135–137 | RV/AP/CP 9/20 | develop 머지 완료 |
| 4 (R4 API·코드) | myDirection·태그 맵 | [reviews-r4-check.json](../../../feedback_loop/2026-09-20/reviews-r4-check.json) 4/4 — 브라우저 시각 확인은 선택 |

## Increment 밖 / backlog

- 실 Toss confirm (로컬 `simulate-payment-paid`)
- A-02 차단 모드 · outbox · PG 환불 · 납품 반려
- R4 브라우저 시각 QA (선택)
