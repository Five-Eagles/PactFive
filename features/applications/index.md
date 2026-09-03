# applications Index

## 담당자
- 조준영 (contracts-payments · reviews · applications) — 2026-09-03 재배정

## 스펙 (features/applications/)
- spec.md: 규칙 1~10. 생성은 `OPEN`만. 수락은 C-01 성공 후 잔여 거절·알림 발행.
  손잡이 `AcceptedApplicationHandoff`. 발송은 notifications.
- api-contract.md: `POST/GET .../applications`, accept·reject,
  내부 `rejectPendingApplications`. PATCH 없음.
- prototype/: 공개 API Mock(`createApplicationApiMock`) + `run.tsx`.
  `npx tsx prototype/run.tsx` → PASS 30.
- design/: high-fi 3뷰 (`design/high-fi.html`). 패널만. 앱 셸 없음.

## 교차 담당
- 유동우: `acceptProjectApplication`. 모집 상태 읽기. `rejectPendingApplications` 호출자.
- 알림 발송: notifications (팀장, 조건부). 조준영은 포트 발행만.
- 합의 진입: contracts-payments가 손잡이 있을 때만 `proposeNegotiationOffer`.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-03 | 재배정. SPEC 규칙 1~10 · API 초안. Mock 없음 |
| 2026-09-03 | high-fi 3뷰. 패널만. 필수 요소 목록 |
| 2026-09-03 | Mock + run.tsx PASS 30. 규칙 1~10 |
