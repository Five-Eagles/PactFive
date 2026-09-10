# 대기 현황판 — 2026-09-10

| | |
|---|---|
| 보내는 사람 | 조준영 · applications · contracts-payments · reviews |
| 범위 | 내 세 기능에서 **다른 사람 손을 기다리는 것** |
| 이전 판 | [waiting-board-2026-09-09.md](waiting-board-2026-09-09.md) (증상 14건 — 어제 이식 후 대부분 닫힘) |

원본(`features/*/prototype/`)은 세 기능 모두 검증 완료 — applications 97 · reviews 69 ·
contracts-payments 347. 아래는 **오늘 기준으로 아직 열린 것만** 모았다.

---

## 지금 열린 것

| # | 증상 / 항목 | 원인 | 담당 | 다음 행동 |
|---|---|---|---|---|
| 1 | 지원 건수 항상 0 · 예산·일정 잠금 안 걸림 | PM `bumpApplicationCounts`는 있음. **`application.service`가 호출 안 함** (CR-AP-001) | 팀장 | [지시서 09-10](../../applications/review/teamlead-port-instructions-2026-09-10-application-count.md) |
| 2 | 프로필 미완성인데 지원 통과 (게이트 꺼짐) | **의도적 보류(RW).** 포트 코드는 UM에 있음. 프로필 입력 화면이 없어 게이트를 켜면 전 프리랜서 지원이 막힘 | 오민혁(화면) → 그다음 팀장(배선) | 화면 생긴 뒤 express·applications 연결. 지금은 **켜지 말 것** |
| 3 | 결제 멱등 — 재시작 후 판정 소실 | `payment_idempotency_records` 테이블은 있음. 런타임은 메모리 `Map` (CR-CP-002 잔여) | 팀장 | 필요 시 새 CR |
| 4 | 리뷰 작성 화면 — 방향 무관 태그 목록 · `PROFESSIONAL_ATTITUDE` 라벨 고정 | `ReviewPage`가 역할을 모름 (R4, 확인 완료) | 팀장 (후속) | `/reviews/me`로 `allowedTags` 축소. **차단 아님**(서버 422) |

## 어제(9/9) 닫힌 것 (참고)

CR-AP-003·004 · CR-CP-001·002(스키마) · CR-RV-001·002 · setClosure · 확인 다이얼로그 ·
납품 메타/다운로드 · 계약 무효화 · 리뷰 태그/라우트/14일 창 · 「완료됨」 CTA ·
`REVIEW_CREATED` 소비자(express 배선) · Toss 키

확인 회신(조준영 2026-09-10): reviews R4 · CR-RV-002 `completed_at`/Projection —
[feedback 9/9 reviews](../../../feedback_loop/2026-09-09/reviews.md) ·
[CR-RV-002 feedback](../../../feedback_loop/2026-09-09/reviews-cr-rv-002-review-windows.md)

## Increment 밖 (손대지 않음)

정산 `RELEASED` 공개 트리거 · outbox worker · `publishDueSoloReviews` 배치 ·
PG 환불·에스크로 · 납품 반려·재납품 · GAP-01/02
