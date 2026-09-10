# 대기 현황판 — 2026-09-10

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) |

원본 검증: applications 97 · reviews 69 · contracts-payments 347.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 1 | 지원 건수 항상 0 · 잠금 안 걸림 | PM 포트는 있음. **`application.service` 미호출** (CR-AP-001) | 팀장 | applications 쪽 지시서(feature/applications PR #102) |
| 2 | 프로필 게이트 꺼짐 | **RW 보류.** 입력 화면 전 켜면 전 지원 차단 | 오민혁(화면) → 팀장 | 화면 후 배선. **지금은 켜지 말 것** |
| 3 | 멱등 — 재시작 후 판정·재현 소실 | 테이블은 있으나 Map 유지. **`payload` 없어 배선 불가** | 팀장 | [CR-CP-003](../change-requests/0003-idempotency-map-to-db.md) |
| 4 | 리뷰 태그 방향 라벨 | R4 확인 완료. `/me`로 축소 가능 | 팀장(후속) | 차단 아님(서버 422) |

## 어제(9/9) 닫힌 것

CR-AP-003·004 · CR-CP-001·002(스키마·역산) · CR-RV-001·002 · setClosure · 다이얼로그 ·
납품·다운로드 · 무효화 · 리뷰 태그/라우트/창 · 완료됨 CTA · `REVIEW_CREATED` 소비자

## Increment 밖

정산 RELEASED 공개 트리거 · outbox worker · PG 환불 · 납품 반려 · GAP-01/02
