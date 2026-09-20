# 대기 현황판 — 2026-09-10 (2026-09-20 Toss sandbox 프로브)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-20 — Toss sandbox 프로브 7/7 · R4/#140 반영 |

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
| R-001 | 지원 행↔건수 `$transaction` | PR #138 · `ApplicationUnitOfWork` |
| **4 R4** | 방향 태그·확인 모달 | [reviews-r4-closeout.json](../../../feedback_loop/2026-09-20/reviews-r4-closeout.json) — API+소스 8/8 |
| **Toss sandbox** | 키·실패 승인·prepare clientKey·PaymentPage 위젯 | [toss-sandbox-probe.json](../../../feedback_loop/2026-09-20/contracts-payments-toss-probe.json) — **7/7**. 성공 confirm(유효 paymentKey)만 위젯 수동 |

## Increment 밖 / backlog

- 성공 Toss confirm (브라우저 결제창) — 로컬 QA는 `simulate-payment-paid` 유지
- A-02 차단 모드 · outbox · PG 환불 · 납품 반려
