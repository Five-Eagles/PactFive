# 공개 API·패널 3종 통합 요청 — 팀장

| | |
|---|---|
| 받는 사람 | 팀장 (`app/` 통합 · ADR-0006) |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-09-03 |
| 정본 | `api-contract.md` 규칙 16 · `design/` 시안 3파일 · `prototype/` Mock |
| 목적 | app에 없는 웹 패널 3종·공개 API를 팀장이 옮길 때 쓸 한 장 |

조준영은 `app/`을 직접 채우지 않는다. 원본은 `features/contracts-payments/`에 있다.
내부 4함수 호출자·`payment.port.ts`·Toss 어댑터는 이미 app 서버에 있다. **다시 서빙하지 말 것.**

---

## Discord

조준영(contracts-payments)입니다. 합의·서명·결제 패널 3종과 공개 API가 `app/`에 없습니다. 웹 `/contracts-payments`는 `NotIntegratedPage`입니다. 서버는 내부 4함수 호출자만 있고 `negotiation-offers`·`signContract`·payments 라우트는 없습니다. 시안 정본은 `design/agreement.html`·`contract-sign.html`·`payment.html`, Mock 정본은 `createPublicApiMock` (`run.tsx` PASS 91). 내부 4함수는 이미 반영됐으니 다시 서빙하지 말아 주세요. 수락 후 합의 진입은 `AcceptedApplicationHandoff`입니다. applications Mock은 PR #52, app `ApplicationsPort`는 아직 unavailable입니다. `PG_SECRET_KEY` 없으면 PaymentGateway Mock을 유지해 주세요. 정본: `features/contracts-payments/review/teamlead-public-api-panels-2026-09-03.md`.

---

## 웹 — 패널 3종

지금 `app/web`의 `/contracts-payments`는 `NotIntegratedPage`다. `AgreementPanel`·`ContractSignPanel`·`PaymentPanel` import는 app에 없다.

| 화면 | 구조 정본 (시안) | 참고 (prototype) |
|---|---|---|
| 합의 | `design/agreement.html` | `prototype/web/AgreementPanel.tsx` |
| 서명 | `design/contract-sign.html` | `prototype/web/ContractSignPanel.tsx` |
| 결제 | `design/payment.html` | `prototype/web/PaymentPanel.tsx` |

시안이 구조 정본이다. prototype 패널은 동작·카피 참고다. 앱 셸·카드 stagger는 넣지 않는다
(`teamlead-panel-portability-2026-09-02.md`). reviews `NotIntegratedPage`는 이 요청 범위가 아니다.

---

## 서버 — 공개 API (규칙 16)

정본: `features/contracts-payments/api-contract.md` 규칙 16.
Mock: `createPublicApiMock` (`prototype/index.ts` export). `preparePayment`·`confirmPayment`·`getPayment` 포함.

| 경로 | 함수 |
|---|---|
| `POST /api/v1/projects/:projectId/negotiation-offers` | `proposeNegotiationOffer` |
| `GET /api/v1/projects/:projectId/negotiation-offers/current` | current |
| `POST .../negotiation-offers/:offerId/accept` | `acceptNegotiationOffer` |
| `POST .../negotiation-offers/:offerId/reject` | `rejectNegotiationOffer` |
| `GET /api/v1/contracts/:contractId` | `getContract` |
| `POST /api/v1/contracts/:contractId/sign` | `signContract` |
| `POST /api/v1/payments` | `preparePayment` |
| `GET /api/v1/payments/:paymentId` | `getPayment` |
| `POST /api/v1/payments/confirm` | `confirmPayment` |

브라우저. `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.

이미 app에 있는 것: 내부 4함수 호출자, `payment.port.ts`, Toss 어댑터.
공개 라우트로 다시 노출하지 않는다.

---

## 손잡이 · 키

수락 후 합의 진입은 `AcceptedApplicationHandoff`다 (`canProposeNegotiationOffer`).
applications Increment Mock은 PR [#52](https://github.com/Five-Eagles/PactFive/pull/52).
app `ApplicationsPort`는 아직 unavailable이다. 손잡이 없이 propose를 열지 않는다.

`PG_SECRET_KEY`가 없으면 PaymentGateway Mock을 유지한다. Toss 실키·위젯 실연동은
`teamlead-pg-sandbox-keys.md` 수신 후.

---

## 해당 없음

`app/web`·`app/server`를 조준영이 수정, reviews `NotIntegratedPage` 교체, Toss 실키,
알림 발송, applications PR 재작업.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| I1 | 시안 3파일을 패널 구조 정본으로 웹에 넣을 수 있는가 | | | |
| I2 | 규칙 16 공개 API만 서빙하고 내부 4함수는 다시 노출하지 않는가 | | | |
| I3 | 합의 진입을 `AcceptedApplicationHandoff` 이후로 묶는가 | | | |
| I4 | 키 없으면 PaymentGateway Mock을 유지하는가 | | | |
