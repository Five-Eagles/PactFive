# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-04
테스트한 커밋: 커밋 전 (`run.tsx` AGR-01·AGR-02·AGR-03·CTR-01·CTR-02·DLV-01·PAY-01·PAY-02·SET-01 v2.0·CAN-01 v2.0 검증 포함)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 323, FAIL 개수: 0)

규칙 9 sandbox는 잘못된 paymentKey 승인 실패·retrieve 실패 프로브. 시크릿은 문서에 적지 않는다.

정산은 slug `set-eligible` 등. `.settlement-grid`(본문 + 340px). 지급 실행 버튼 없음.
수수료 스냅샷·ELIGIBLE·RELEASED 원자 반영·C-03 409 재판정. `SETTLEMENT_*` 코드 없음.

취소는 slug `can-available`·`can-m01`·`can-followup` 등. `.cancellation-grid`(본문 + 340px). A-07 POST 없음. 무효화 멱등·결제 시작 후 409·서명 감사 보존. 202 후처리는 취소 실패가 아니다. 브라우저 자동화는 없어 `run.tsx` SSR로 확인했다.

합의 재제안은 slug `agr-counter`·`agr-client-action`. 이력은 `agr-history`. 과거 라운드는 「이후 제안으로 대체됨」만. `/agreements/{id}` 5종·`AGREEMENT_*`·`SUPERSEDED` 저장 없음.

서명은 slug `ctr-wait`. 순서 자유·취소 후 409 `PROJECT_TRANSITION_CONFLICT`. `CONTRACT_*` 코드 없음. SIGNED만으로 `IN_PROGRESS`가 되지 않는다.

결제는 slug `pay-confirming`·`pay-syncing`·`pay-unsigned`. SIGNED 의뢰인만 prepare, 직전 `markPaymentPending`. timeout은 `PENDING` 후 조회 복구. 웹훅 Mock 중복 1회·역순 비회귀. 회로 Open은 409. `PAYMENT_FORBIDDEN` 없음.

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 버전 불일치 409·토큰 불일치 422 | 통과 |
| 2 호출 전 조회 | 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | 전이·멱등·취소 409·null 수락 409 | 통과 |
| 4 completeProjectTransaction | I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등 | 통과 |
| 5 restorePreContractProject | 재개·멱등·DEADLINE_PASSED | 통과 |
| 6 markPaymentPending | 최초 기록·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | mark → start → complete · 납품 Mock 경로만 납품 publish | 통과 |
| 8 오류 코드 | 5종 코드·에러 봉투만 | 통과 |
| 9 PaymentGateway | Mock 승인·키 없음 Mock 유지·sandbox 잘못된 키 승인/조회 실패 | 통과 |
| 10~13 합의·서명 | 제안·재제안·과거 라운드 대체됨·수락→DRAFT·순서 자유 서명·SIGNED 직후 CONTRACT_PENDING·취소 후 409 | 통과 |
| 14 샌드박스 결제 범위 | SIGNED 의뢰인 prepare·mark·Redirect≠PAID·웹훅 Mock 재검증 | 통과 |
| 15 취소 무효화 | NOT_NEEDED·DONE·멱등. 상세 가드는 규칙 25 | 통과 |
| 16 공개 API 경로 | GET payment·settlement·cancellation 당사자 200 · 비당사자 403 · 없음 404 · counter 수신자만 · SIGNED 후 prepare/confirm | 통과 |
| 17 라우트·UX | CAN-01 `.../cancellation`. AGR 취소 vs 거절. CTR 상대 대기. PAY 확인 중·미체결·동기화 | 통과 |
| 18 Increment 1 테스트 | 규칙 22로 이동 | 안 함 (해당 없음) |
| 19~22 | PENDING 복구·FAILED 재시도·웹훅 Mock·위젯 로더 분기·백로그 UX | 통과 |
| 23 납품 Increment | GET IN_PROGRESS 행 · 멱등 1회 · 승인/정산 양쪽 complete · `DELIVERY_*` 없음 | 통과 |
| 24 정산 실행 | 수수료 버림·스냅샷 불변·ELIGIBLE 1건·멱등·SUCCESS/FAILURE/UNKNOWN·C-03 409 재판정 | 통과 |
| 25 합의·계약 무효화 | DONE/NOT_NEEDED/멱등·다른 본문 409·paymentPendingAt 409·감사 보존·FAILED 후처리·IN_PROGRESS 409 | 통과 |
| UI(design/web) | AGR·CTR-02·PAY-02 확인 중·DLV·PAY·SET·CAN-01. 1280 2열 / 모바일 스택 | 통과 |

규칙 4 I-30: APPROVED∧RELEASED 전에 complete 포트를 부르지 않는다.

## ux-philosophy.md §6 자체 점검 (취소)

| 검증 항목 | 이 화면에서 어떻게 충족하는가 |
|---|---|
| 상태 이해 | 가능·완료·후처리 중·결제 시작 후 취소를 문장으로 구분한다. |
| 근거 이해 | 후처리 `DONE`/`NOT_NEEDED`/`FAILED`를 취소 실패로 쓰지 않는다. |
| 작업 보호 | A-07 POST 없음. 사유는 화면에만 두고 서버로 보내지 않는다. |
| 복구 가능성 | LOAD_FAILED 「다시 시도」, STALE 「다시 불러오기」. |
| 선택권 | 확인 모달 「계속 진행」. 완료 후 내 프로젝트. |
| 비파괴성 | 「프로젝트를 취소할까요?」·되돌릴 수 없음. 환불 버튼 없음. |
| 접근 가능성 | `h1`, 다이얼로그 `aria-modal`. 포커스 트랩 없음. |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 스탠드인 Mock이다. A-07 실호출·알림 발송·환불은 Increment 밖이다.
- 웹 패널은 app 미반영.

## 팀장에게 물어봐야 하는 것

요청 전문: `review/teamlead-pg-sandbox-keys.md`. 2026-08-31 미수신.
