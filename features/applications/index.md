# applications Index

## 담당자
- 조준영 (contracts-payments · reviews · applications) — 2026-09-03 재배정

## 스펙 (features/applications/)
- spec.md: 규칙 1~10. OPEN만. 입력 범위. 프로필 포트. 취소 NULL(Mock).
  수락은 C-01 후 outbox. 손잡이 `AcceptedApplicationHandoff`. 발송은 notifications.
- api-contract.md: eligibility · 단건 GET · 페이지 · accept 202 · operation.
  공개 경로는 `/applications/me`. PATCH 없음.
- prototype/: `createApplicationApiMock` + `run.tsx`. holdOutbox면 202.
  `npx tsx prototype/run.tsx` → PASS 97.
- design/: high-fi. 프로필 잠금 · 후속 처리 · 취소됨 포함.
- review/: 팀장 통합 요청 `review/teamlead-public-api-panels-2026-09-03.md`.
- change-requests/: `0001` 반영중. `0002` 반영중(Mock). `app/` 미이식.

## 교차 담당
- 유동우: `acceptProjectApplication`. 모집 상태 읽기. `rejectPendingApplications` 호출자.
  수락·마감·취소 때 `pendingApplicationCount: 0` (CR-AP-001).
- 알림 발송: notifications (팀장, 조건부). 조준영은 포트 발행만.
- 합의 진입: contracts-payments가 손잡이 있을 때만 `proposeNegotiationOffer`.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-03 | 재배정. SPEC 규칙 1~10 · API 초안. Mock 없음 |
| 2026-09-03 | high-fi 3뷰. 패널만. 필수 요소 목록 |
| 2026-09-03 | Mock + run.tsx PASS 30. 규칙 1~10 |
| 2026-09-03 | 팀장 통합 요청 1장 (`review/teamlead-public-api-panels-2026-09-03.md`) |
| 2026-09-03 | C-01 실패 시 잔여 거절·알림 금지 Mock. PASS 31 |
| 2026-09-03 | test-report Known Issues에 통합 요청 파일명. run.tsx 재실측 PASS 31 |
| 2026-09-03 | 시안·패널에 수락 확인·빈 목록·삭제된 프로젝트·preview 전환. PASS 35 |
| 2026-09-07 | CR-AP-001 반영중. 생성 +1/+1 · DIRECT −1. 수락 대기는 C-01 스탠드인 0 |
| 2026-09-07 | listMyApplications `transactionStatus`. 「완료됨」→ `/projects/:id/reviews` |
| 2026-09-07 | 설계서 v2.0: 입력 범위·제출 확인·거절 문구. 후속은 CR-0002 |
| 2026-09-07 | CR-0002 Mock: eligibility·202/outbox·GAP-01 NULL·페이지 |
| 2026-09-08 | feedback 항목 1 반영완료. PM 프로젝트 조각은 읽기 포트. |
| 2026-09-08 | feedback 항목 2 반영완료. CR-AP-001 쓰기 포트. Mock만. |
