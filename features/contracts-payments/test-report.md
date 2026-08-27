# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-08-27
테스트한 커밋: 3f14de0 이후 작업 중

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 28, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 「start 버전 불일치 409」·토큰 불일치 422·규칙 6 버전 비증가 | 통과 |
| 2 호출 전 조회 | `run.tsx` 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | `run.tsx` 전이·멱등·취소 409·null 수락 409·지원서 불일치 시 포트 미호출 | 통과 |
| 4 completeProjectTransaction | `run.tsx` I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등·CANCELED 409 | 통과 |
| 5 restorePreContractProject | `run.tsx` 재개·멱등·다른 협상 409·DEADLINE_PASSED·PENDING_APPLICATIONS_REMAIN | 통과 |
| 6 markPaymentPending | `run.tsx` 최초 기록·시각 유지·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | `run.tsx` markPaymentPending → start → complete (시드는 이미 CONTRACT_PENDING) | 통과 |
| 8 오류 코드 | `run.tsx` 5종 코드·에러 봉투만 사용 | 통과 |
| 9 PaymentGateway | `run.tsx` Mock 승인 성공·금액 불일치. sandbox는 키 없으면 해당 없음 | 통과 |
| 10 금액 합의 | spec 규칙만. Mock 없음 | 안 함 |
| 11 수락→계약 DRAFT | spec 규칙만 | 안 함 |
| 12 계약 상태 전이 | spec 규칙만 | 안 함 |
| 13 signContract | spec 규칙만 | 안 함 |
| 14 샌드박스 결제 범위 | 규칙 9 Mock. 준비·웹훅 E2E 없음 | 안 함 (해당 없음) |
| 15 취소 무효화 | spec 규칙만 | 안 함 |
| 16 공개 API 경로 | 문서 초안 | 안 함 |
| 17 라우트·UX | 문서 초안. design/ 없음 | 안 함 |
| 18 Increment 1 테스트 목록 | 목록만 적음. 구현은 다음 스프린트 | 안 함 |
| UI(design/web) | 다음 스프린트 | 안 함 |

규칙 4의 I-30은 호출자 검증이다. `completeProjectTransactionIfSettled`가 APPROVED∧RELEASED 전에는 포트를 부르지 않는다.

규칙 7의 최윤석 구간(수락 → 잔여 PENDING 거절 → 알림)은 2026-08-26 회신으로 확정이다. 시드
`CONTRACT_PENDING`은 그 세 단계가 끝난 상태다.

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 유동우 포트 스탠드인 Mock이다. 실제 HTTP·DB는 없다.
- `design/`·`prototype/web/` 없음. Increment 1 화면은 다음 스프린트.
- Toss sandbox 실호출은 `PG_SECRET_KEY`가 있을 때만. 지금은 해당 없음.
- 규칙 10~18은 설계 확정이다. `run.tsx` 추가는 다음 스프린트.

## 팀장에게 물어봐야 하는 것

요청 전문: `review/teamlead-pg-sandbox-keys.md` (Discord/이슈 한 단락).

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 로컬 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지

답이 없어도 포트·Mock 골격은 진행한다. 시크릿이 오면 `run.tsx` sandbox 실호출만 이어서 확인.
