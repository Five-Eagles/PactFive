# 2026-09-09 — contracts-payments 3~4단계 (PENDING 복구·멱등) (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 7번째 단위.
근거: `features/contracts-payments/review/teamlead-port-instructions-2026-09-09.md`
(조준영, origin/feature/contracts-payments). #199에서 미룬 §3·§4를 반영했다.

## 무엇을 했나

### §3 — 결제가 PENDING에 갇히면 스스로 못 빠져나오던 문제

`toss-payments.adapter.ts`에 `retrievePayment` 구현은 있었는데 부르는 곳이 없었다. 지시서
권고대로(웹훅보다 먼저, "사용자가 결제 화면을 다시 열 때 조회로 복구") `getPayment`에
재조회를 붙였다 — 원본(`prototype/mock/payment-record.mock.ts:303~314`)의
`reconcilePendingPayments`와 같은 판정.

- `getPayment` 호출 시 `row.status === 'PENDING'`이고 `paymentGateway`가 설정돼 있으면
  `retrievePayment(row.orderId)`로 PG측 실제 상태를 재확인한다.
  - `PAID`면 `row.status = 'PAID'`로 갱신하고 `confirmPayment`의 성공 경로와 같이
    `coordinator.onPaymentPaid`를 호출한다(교차 생명주기 규칙 26 — SIGNED∧PAID일 때만
    start를 부른다).
  - `FAILED`면 `row.status = 'FAILED'`로 갱신한다.
  - 그 외(`READY`·`PENDING`)는 아직 결론이 안 났다는 뜻이라 손대지 않는다.
- 재조회 자체가 실패해도(PG 장애·네트워크) 예외를 삼킨다 — 결제 조회 응답은 항상 나가야
  하고, 다음에 화면을 다시 열면 또 시도한다.
- **웹훅 수신부는 만들지 않았다.** 지시서가 명시적으로 "서명 검증·재시도까지 필요해 분량이
  크다"며 이 순서(retrievePayment 먼저)를 권고했다 — 웹훅은 이번 범위 밖으로 남긴다.

### §4 — 멱등 두 경로가 본문을 비교하지 않던 문제

`requestDelivery`는 캐시된 입력과 새 입력을 비교해 다르면 409를 던지고 있었는데,
`approveDelivery`와 `invalidateAgreement`는 캐시가 있으면 본문을 보지 않고 그대로
반환하고 있었다(규칙 23·25 위반).

- 두 함수 모두 `requestDelivery`와 같은 패턴으로 바꿨다 — `{ input, response }`를 함께
  저장하고, 캐시 히트 시 `JSON.stringify(cached.input) !== JSON.stringify(input)`이면
  `PROJECT_TRANSITION_CONFLICT`(409)를 던진다.
- `approveDelivery`는 이미-APPROVED 재확인 경로(캐시 미스 상태에서 델리버리가 이미
  APPROVED인 경우)의 `setIdempotent` 호출도 같은 모양으로 맞췄다 — 이후 같은 키로 다시
  들어오면 비교 대상이 있어야 한다.

**`JSON.stringify` 비교의 한계는 지시서가 이미 지적했다** — 키 순서가 바뀌면 오탐한다.
지시서는 CR-CP-002의 `body_hash` 테이블이 더 나은 방법이라고 명시했지만, 그 테이블은
아직 없다(#202에서 다룬다). 지금은 이미 같은 파일 안에서 검증된 패턴(`requestDelivery`)을
그대로 복제하는 것이 "판단을 남기지 않는" 이식 원칙에 맞다고 판단했다 — #202에서
`body_hash` 테이블이 생기면 이 세 경로(requestDelivery·approveDelivery·invalidateAgreement)
전부를 같은 방식으로 옮기는 후속 작업이 남는다.

## 담당자별 영향·후속 조치

**조준영 (contracts-payments)** — 영향 없음, 후속 조치 없음. 본인이 쓴 지시서 §3·4를
그대로 반영했다. §4에서 지적한 "JSON.stringify 키 순서 오탐" 한계는 그대로 남아 있다는
점을 인지하고 있다 — #202의 `body_hash` 테이블이 근본 해법이다.

**유동우 (project-management)** — 영향 없음. `invalidateAgreement`의 멱등 판정 강화는
그쪽에서 오는 호출 방식(내가 #199에서 배선한 `contracts-payments.adapter.ts`)이 매번
`cancellationId`에서 파생한 동일한 `requestId`·`idempotencyKey`를 보내므로, 같은
`cancellationId`로 재호출해도 입력이 항상 동일해 이번 409 조건에 걸리지 않는다 — 확인함.

## 검증

- `app/server` tsc 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과
- 웹 변경 없음(재조회는 GET 응답에 투명하게 반영되므로 화면 쪽 수정이 필요 없다)
