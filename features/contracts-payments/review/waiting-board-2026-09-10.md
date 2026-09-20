# 대기 현황판 — 2026-09-10 (2026-09-20 R-001 머지 후)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-20 — PR #138 머지 · R-001 닫음 |

원본 — applications 97 · reviews 69 · contracts-payments 347.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 2 | 프로필 게이트 꺼짐 | **RW 보류** (ADR-0014) | 오민혁 → 팀장 | **켜지 말 것** |

## 닫은 것

| # | 항목 | 근거 |
|---|---|---|
| 1 | 지원 건수 0 · 잠금 | AP PR #114 |
| 3 | 멱등 Map → DB payload | CR-CP-003 PR #115 |
| R-06 / bodyHash | rating 404 · P2000 | reviews PR #135 |
| R-001 | 지원 행↔건수 `$transaction` | **PR #138** · `ApplicationUnitOfWork` |
| 4 (R4 API·코드) | myDirection·태그 맵 | reviews-r4-check 4/4 |

## Increment 밖 / backlog

- 실 Toss confirm (로컬 `simulate-payment-paid`)
- A-02 차단 모드 · outbox · PG 환불 · 납품 반려
- R4 브라우저 시각 QA (선택)
