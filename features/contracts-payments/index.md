# contracts-payments Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/contracts-payments/)
- spec.md: 계약 연동 함수 4개 호출 계약
  (`startProjectTransaction` · `completeProjectTransaction` ·
  `restorePreContractProject` · `markPaymentPending`).
  화면·PG·서명 UI는 아직 범위 밖.
- api-contract.md: 위 4함수 + 호출 전 조회 `getProjectNegotiationContext`.
  경로 `/internal/v1/...`. 유동우 Mock이 구현하고 조준영 Mock이 호출한다.
- review/: 교차 담당 확인 요청·회신.
  Mock import 안내는 `review/mock-stub-import-guide.md` (유동우·최윤석 공유).
- prototype/: 유동우 포트 스탠드인 Mock + 조준영 호출 서비스.
  `npx tsx prototype/run.tsx`로 spec 규칙 1~8을 확인한다.
- design/: 없음. 화면은 다음 증분.

## 교차 담당
- 유동우 (project-management): 4함수 제공자. 2026-08-25 함수별 정의 회신 반영 완료
  (`review/yudong-function-defs-reply.md`). 최윤석 확인은 대기.
- 최윤석 (applications): 지원 수락이 `startProjectTransaction`의 선행.
  spec.md 「담당자 확인」 1~3.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-25 | 호출 계약 초안. PRD v6.4 §5.4 · ERD v1.4 정본 |
| 2026-08-25 | 유동우 함수별 정의 회신 반영. P3 `contractId` 본문 필수. `/internal/v1`. 최윤석 대기 |
| 2026-08-26 | prototype Mock + run.tsx. spec 규칙 1~8 PASS 24 |
| 2026-08-26 | 유동우·최윤석 Mock import 안내 (`review/mock-stub-import-guide.md`) |
