# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-03
테스트한 커밋: 이 커밋 (`run.tsx` 포함). 회신 대기 중 재실측.

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 91, FAIL 개수: 0)

키 없는 환경. 규칙 9 sandbox는 「해당 없음」 1건 PASS.

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 「start 버전 불일치 409」·토큰 불일치 422·규칙 6 버전 비증가 | 통과 |
| 2 호출 전 조회 | `run.tsx` 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | `run.tsx` 전이·멱등·취소 409·null 수락 409·COMPLETED에서 start 409·지원서 불일치 시 포트 미호출 | 통과 |
| 4 completeProjectTransaction | `run.tsx` I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등·CANCELED 409·CONTRACT_PENDING에서 complete 409 · publish는 규칙 7 | 통과 |
| 5 restorePreContractProject | `run.tsx` 재개·멱등·다른 협상 409·DEADLINE_PASSED·PENDING_APPLICATIONS_REMAIN | 통과 |
| 6 markPaymentPending | `run.tsx` 최초 기록·시각 유지·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | `run.tsx` mark → start → complete · Handoff만 propose · PAID/COMPLETED publish · throw여도 유지 | 통과 |
| 8 오류 코드 | `run.tsx` 5종 코드·에러 봉투만 사용 | 통과 |
| 9 PaymentGateway | `run.tsx` Mock 승인·금액 불일치. 키 없음 Mock 유지·어댑터 PgKeyMissingError·keyMissing UX. sandbox는 키 없으면 해당 없음 | 통과 |
| 10 금액 합의 | `run.tsx` 「의뢰인 제안」 | 통과 |
| 11 수락→계약 DRAFT | `run.tsx` 「수락→DRAFT」 | 통과 |
| 12 계약 상태 전이 | `run.tsx` 「첫 서명 SIGNING」·「양쪽 서명 SIGNED」 | 통과 |
| 13 signContract | `run.tsx` 「서명 멱등 최초 시각」 | 통과 |
| 14 샌드박스 결제 범위 | 규칙 9 Mock. 웹훅 E2E·결제 취소·PG 환불 없음 | 안 함 (해당 없음) |
| 15 취소 무효화 | `run.tsx` 「무효화 NOT_NEEDED」·「DONE」·멱등 | 통과 |
| 16 공개 API 경로 | `run.tsx` 「현재 조회」 (`getCurrentNegotiationOffer`). GET payment 당사자 200 · 비당사자 403 · 없음 404. POST payments 준비 당사자 200 · confirm 당사자 PAID | 통과 |
| 17 라우트·UX | `run.tsx` 합의 로딩·불러오지 못했습니다·409 재조회·취소 후 변경 숨김. 서명 근거·서명하기·불러오지 못했습니다·취소 안내. 결제 금액·플랫폼 수수료·정산액·결제하기·FAILED 다시 결제 | 통과 |
| 18 Increment 1 테스트 목록 | 규칙 22로 이동 | 안 함 (해당 없음) |
| 19 계약·결제 전이표 | `run.tsx` PG 실패 키면 FAILED · 재시도 후 승인 성공 PAID. 계약 전이는 규칙 12·15 | 통과 (결제 행 Mock) |
| 20 수락 시 계약 필드 | `run.tsx` 「수락 시 계약 필드」 (`getContract`) | 통과 |
| 21 FAILED 재시도·웹훅 | `run.tsx` 같은 paymentId·새 orderId READY · 옛 orderId confirm 409 · 「retrievePayment FAILED」. 화면 폴링은 규칙 16 GET payment. 웹훅 없음 | 통과 (Mock). 웹훅은 해당 없음 |
| 22 Increment 1 백로그 | `run.tsx` 빈 생성 · 수락/거절 멱등 · 거절→restore · 비당사자 403 · 로딩 · LOAD_FAILED · 409 재조회 · 취소 후 변경 숨김 | 통과 |
| UI(design/web) | high-fi 패널 3화면 + `AgreementPanel`·`ContractSignPanel`·`PaymentPanel`. 키 없음은 결제하기 숨김 | 통과 |

규칙 4의 I-30은 호출자 검증이다. `completeProjectTransactionIfSettled`가 APPROVED∧RELEASED 전에는 포트를 부르지 않는다.

규칙 7의 최윤석 구간(수락 → 잔여 PENDING 거절 → 알림)은 2026-08-26 회신으로 확정이다. 시드
`CONTRACT_PENDING`은 그 세 단계가 끝난 상태다. `AcceptedApplicationHandoff`만 propose 진입.
알림 4종은 `NotificationTriggerPort` 발행만. 발송은 최윤석.

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 유동우 포트 스탠드인 Mock이다. 실제 HTTP·DB는 없다.
- 웹 패널 3종·공개 API 라우트는 app 미반영. 팀장 통합 요청: `review/teamlead-public-api-panels-2026-09-03.md`.
- Toss sandbox 실호출은 루트 `.env`의 `PG_SECRET_KEY`가 있을 때만. 지금은 해당 없음.
- 알림 발송·지원 수락 구현은 최윤석. 이번 Increment는 포트 발행만.
- 위젯 실연동·에스크로·PG 환불·재제안은 Increment 1 밖이다.

## 팀장에게 물어봐야 하는 것

요청 전문: `review/teamlead-pg-sandbox-keys.md` (Discord/이슈 한 단락).

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 루트 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지

답이 없어도 포트·Mock 골격은 진행한다. 시크릿이 오면 `run.tsx` sandbox 실호출만 이어서 확인.
2026-08-31 미수신. 14일·오민혁 `REVIEW_CREATED`·최윤석 알림 발송은
`review/external-wait-2026-08-31.md`. 포트 계약은 `review/yoonseok-ports-contract.md`.
