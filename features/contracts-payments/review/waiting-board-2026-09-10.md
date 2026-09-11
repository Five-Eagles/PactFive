# 대기 현황판 — 2026-09-10 (2026-09-11 갱신)

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |
| 갱신 | 2026-09-11 — 지원 건수 배선(#1) develop 반영 확인 후 닫음 |

원본(`features/*/prototype/`) — applications 97 · reviews 69 · contracts-payments 347.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 2 | 프로필 미완성인데 지원 통과 (게이트 꺼짐) | **의도적 보류(RW).** ADR-0014 §2.3 · 포트는 UM에 있음 | 오민혁(화면) → 팀장 | 화면 후 배선. **지금은 켜지 말 것** |
| 3 | 결제 멱등 — 재시작 후 값 복원 | Map+DB 마커만. payload 컬럼 없음 (CR-CP-003) | 팀장 | [CR-CP-003](../change-requests/0003-idempotency-map-to-db.md) |
| 4 | 리뷰 태그 방향 라벨 (화면) | R4. `/me`·`myDirection`은 서버·웹에 반영됨 — 배포본 스모크만 | (선택) QA | 차단 아님 |
| 5 | 지원 행 vs `applicationCount` drift · CLOSED 건수 0 | ADR-0015 **R-001** + 9/11 API 스모크 | 팀장(app) | [세션 메모](../../../feedback_loop/2026-09-11/applications.md) |

## 오늘(9/11) 닫은 것

| # | 항목 | 근거 |
|---|---|---|
| 1 | 지원 건수 0 · 잠금 안 걸림 | `application.service`가 `bumpApplicationCounts` 호출 (+1/+1, DIRECT −1). develop 머지본·지시서 대조 완료. prototype PASS 97 |

## 어제(9/9) 닫힌 것 (참고)

CR-AP-003·004 · CR-CP-001·002(스키마) · CR-RV-001·002 · setClosure · 확인 다이얼로그 ·
납품 메타/다운로드 · 계약 무효화 · 리뷰 태그/라우트/14일 창 · 「완료됨」 CTA ·
`REVIEW_CREATED` 소비자 · Toss 키

## Increment 밖 / 잔여 리스크 (ADR-0015)

- R-001: 지원 행 INSERT와 건수 bump가 **같은 Prisma `$transaction`이 아님** (호출은 있음)
- 프로필 게이트 E2E · outbox worker · PG 환불 · 납품 반려 · GAP-01/02
