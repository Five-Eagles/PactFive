# 대기 현황판 — 2026-09-10 (2026-09-11 reviews 세션)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-11 — AP #1 · CR-CP-003 #3 닫음 · reviews QA |

원본 — applications 97 · reviews **69** · contracts-payments 347.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 2 | 프로필 게이트 꺼짐 | **RW 보류** (ADR-0014) | 오민혁 → 팀장 | 화면 후 배선. **켜지 말 것** |
| 4 | 리뷰 태그 방향 (화면) | R4. `/me`·myDirection 반영됨 | (선택) QA | 차단 아님 — COMPLETED 후 브라우저 |

## 오늘(9/11) 닫은 것

| # | 항목 | 근거 |
|---|---|---|
| 1 | 지원 건수 0 · 잠금 | AP PR #114 · bump 호출 |
| 3 | 멱등 Map → DB payload | **CR-CP-003** PR #115 · migration · T13 PASS |

## Increment 밖 / backlog

- R-001 지원 행↔건수 `$transaction`
- 실 Toss confirm → simulate-settlement → reviews 작성 E2E
- A-02 · outbox · PG 환불 · 납품 반려
