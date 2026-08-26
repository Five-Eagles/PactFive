# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-08-26
테스트한 커밋: 커밋 전

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 24, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 「start 버전 불일치 409」·규칙 6 버전 비증가 | 통과 |
| 2 호출 전 조회 | `run.tsx` 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | `run.tsx` 전이·멱등·취소 409·null 수락 409·지원서 불일치 시 포트 미호출 | 통과 |
| 4 completeProjectTransaction | `run.tsx` I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등·CANCELED 409 | 통과 |
| 5 restorePreContractProject | `run.tsx` 재개·멱등·다른 협상 409·DEADLINE_PASSED·PENDING_APPLICATIONS_REMAIN | 통과 |
| 6 markPaymentPending | `run.tsx` 최초 기록·시각 유지·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | `run.tsx` markPaymentPending → start → complete (시드는 이미 CONTRACT_PENDING) | 통과 |
| 8 오류 코드 | `run.tsx` 5종 코드·에러 봉투만 사용 | 통과 |
| UI(design/web) | 이번 spec 범위 밖 (화면·PG·서명 제외) | 안 함 (해당 없음) |

규칙 4의 I-30은 호출자 검증이다. `completeProjectTransactionIfSettled`가 APPROVED∧RELEASED 전에는 포트를 부르지 않는다.

규칙 7의 최윤석 구간(수락→거절→알림)은 PRD 가정으로 시드가 `CONTRACT_PENDING`인 것만 확인했다.

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 유동우 포트 스탠드인 Mock이다. 실제 HTTP·DB는 없다.
- 최윤석 확인 3건은 아직 회신 없음. 순서 가정이 바뀌면 규칙 7 테스트를 고친다.
- `design/`·`prototype/web/` 없음. 다음 증분(합의·서명·PG 화면).

## 팀장에게 물어봐야 하는 것

- 없음.
