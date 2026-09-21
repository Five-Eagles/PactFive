# contracts-payments — 2026-09-21 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| payment-ready API ([contracts-payments-api-smoke.json](./contracts-payments-api-smoke.json)) | **6 PASS / 0 FAIL** |
| Toss sandbox 프로브 ([contracts-payments-toss-probe.json](./contracts-payments-toss-probe.json)) | **7 PASS / 0 FAIL** |

## 2. 관찰

- PG 키·게이트웨이 설정 OK. 실패 confirm/retrieve·prepare `clientKey`·PaymentPage 위젯 배선 재확인.
- 성공 Toss confirm(유효 paymentKey)은 브라우저 결제창 수동 — 로컬은 `simulate-payment-paid`.

## 3. 잔여

| ID | 내용 | 제안 |
|---|---|---|
| 성공 Toss confirm | 위젯 수동 | Increment 밖 |
| A-02 · outbox · PG 환불 · 납품 반려 | Increment 밖 | 손대지 않음 |
