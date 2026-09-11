# 대기 현황판 — 2026-09-10 (2026-09-11 CP 세션)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-11 — AP 건수(#1) 닫음 · CP 세션 시작 |

원본 — applications 97 · reviews 69 · contracts-payments **347**.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 2 | 프로필 게이트 꺼짐 | **RW 보류** (ADR-0014) | 오민혁 → 팀장 | 화면 후 배선. **켜지 말 것** |
| 3 | 결제 멱등 — 재시작 후 값 복원 | Map+DB 마커. **payload 없음** (CR-CP-003) | 팀장 | [CR-CP-003](../change-requests/0003-idempotency-map-to-db.md) |
| 4 | 리뷰 태그 방향 (화면) | R4. `/me`·myDirection 반영됨 | (선택) QA | 차단 아님 |

## 오늘(9/11) 닫은 것

| # | 항목 | 근거 |
|---|---|---|
| 1 | 지원 건수 0 · 잠금 | app `bumpApplicationCounts` 호출됨 (AP PR #114). prototype 97 |

## Increment 밖 / backlog

- CR-CP-003 payload·복합 PK (재시작 값 복원)
- R-001 지원 행↔건수 `$transaction`
- 정산 RELEASED 공개 트리거 · outbox · PG 환불 · 납품 반려
