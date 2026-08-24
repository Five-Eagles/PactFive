# contracts-payments — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다.

## POST /agreements

지원서에 대한 금액 합의를 제안한다 (spec.md 규칙 1).

요청:

```json
{ "applicationId": "app_123", "agreedAmount": 1000000 }
```

응답 201:

```json
{
  "id": "agr_123",
  "applicationId": "app_123",
  "proposedByUserId": "usr_client_a",
  "agreedAmount": 1000000,
  "status": "PROPOSED",
  "respondedAt": null,
  "createdAt": "2026-08-24T09:00:00Z"
}
```

에러: 404 — 지원서 없음. 409 — 이미 활성(`PROPOSED`) 상태의 합의가 존재함.

## POST /agreements/:agreementId/accept

제안을 받은 상대측이 수락한다. 성공 시 `contracts`를 자동 생성한다 (spec.md 규칙 2).

요청: 본문 없음

응답 200:

```json
{
  "agreement": { "id": "agr_123", "status": "ACCEPTED", "respondedAt": "2026-08-24T10:00:00Z" },
  "contract": {
    "id": "con_123",
    "agreementId": "agr_123",
    "projectId": "prj_123",
    "clientId": "usr_client_a",
    "freelancerId": "usr_freelancer_a",
    "projectTitleSnapshot": "쇼핑몰 리뉴얼",
    "agreedAmount": 1000000,
    "status": "DRAFT",
    "createdAt": "2026-08-24T10:00:00Z"
  }
}
```

에러: 404 — 합의 없음. 403 — 제안을 받은 상대측이 아님. 409 — 이미 응답된 합의(`ACCEPTED`/`REJECTED`).

## POST /agreements/:agreementId/reject

제안을 받은 상대측이 거절한다. 성공 시 `restorePreContractProject`(C-04)를 호출한다 (spec.md 규칙 3).

요청: 본문 없음

응답 200:

```json
{
  "agreement": { "id": "agr_123", "status": "REJECTED", "respondedAt": "2026-08-24T10:00:00Z" },
  "projectRestored": { "recruitmentStatus": "OPEN", "transactionStatus": "NONE", "reopened": true }
}
```

에러: 404 — 합의 없음. 403 — 제안을 받은 상대측이 아님. 409 — 이미 응답된 합의.

## POST /contracts/:contractId/sign

계약에 서명한다 (spec.md 규칙 4).

요청:

```json
{ "ipAddress": "203.0.113.10", "userAgent": "Mozilla/5.0 ..." }
```

응답 200:

```json
{
  "id": "con_123",
  "status": "SIGNING",
  "clientSignedAt": "2026-08-24T11:00:00Z",
  "freelancerSignedAt": null,
  "signedAt": null
}
```

에러: 404 — 계약 없음. 403 — 계약 당사자(client/freelancer)가 아님. 409 — 이미 같은 쪽이 서명함,
또는 계약 상태가 `DRAFT`/`SIGNING`이 아님(`CANCELED` 등).

## POST /payments/confirm

결제를 확정한다. PG 결제 요청 직전에 서버가 `markPaymentPending`(C-07)을 호출한다 (spec.md 규칙
5~9).

요청:

```json
{
  "contractId": "con_123",
  "pgProvider": "TOSS",
  "pgOrderId": "order_20260824_001",
  "pgPaymentKey": "pg_key_abc"
}
```

응답 200:

```json
{
  "id": "pay_123",
  "contractId": "con_123",
  "currency": "KRW",
  "paymentAmount": 1000000,
  "platformFeeAmount": 100000,
  "settlementAmount": 900000,
  "status": "PAID",
  "paidAt": "2026-08-24T12:00:00Z"
}
```

에러: 404 — 계약 없음. 409 — 계약이 `SIGNED`가 아님, 또는 PG 승인 실패(`status: FAILED`로 응답,
HTTP 200에 `failureCode`/`failureMessage` 포함 — PG 콜백 처리 특성상 4xx로 응답하지 않음).

## POST /deliveries

납품을 요청한다 (spec.md 규칙 11).

요청:

```json
{ "contractId": "con_123", "message": "1차 산출물입니다.", "attachmentUrl": "https://..." }
```

응답 201:

```json
{
  "id": "del_123",
  "contractId": "con_123",
  "status": "DELIVERY_REQUESTED",
  "requestedAt": "2026-08-25T09:00:00Z"
}
```

에러: 404 — 계약 없음. 403 — 계약의 freelancer가 아님. 409 — 계약 상태가 `SIGNED`가 아님.

## POST /deliveries/:deliveryId/approve

납품을 승인한다. 성공 시 정산(`payments.status → RELEASED`)까지 함께 처리하고,
`completeProjectTransaction`(C-03)을 호출한다 (spec.md 규칙 12~13).

요청: 본문 없음

응답 200:

```json
{
  "delivery": { "id": "del_123", "status": "APPROVED", "approvedAt": "2026-08-25T10:00:00Z" },
  "payment": { "id": "pay_123", "status": "RELEASED", "releasedAt": "2026-08-25T10:00:00Z" }
}
```

에러: 404 — 납품 없음. 403 — 계약의 client가 아님. 409 — 납품 상태가 `DELIVERY_REQUESTED`가 아님.

## DTO

```ts
// naming-convention.md §6: 서버 내부 입력은 ...Input, HTTP 요청 본문은 ...Request,
// 응답은 ...Response, 목록 항목은 ...Item

type AgreementStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
type ContractStatus = 'DRAFT' | 'SIGNING' | 'SIGNED' | 'CANCELED';
type PaymentStatus = 'READY' | 'PENDING' | 'PAID' | 'FAILED' | 'RELEASED' | 'REFUNDED';
type DeliveryStatus = 'IN_PROGRESS' | 'DELIVERY_REQUESTED' | 'APPROVED';

type ProposeAgreementRequest = { applicationId: string; agreedAmount: number };
type AgreementResponse = {
  id: string;
  applicationId: string;
  proposedByUserId: string;
  agreedAmount: number;
  status: AgreementStatus;
  respondedAt: string | null;
  createdAt: string;
};

type ContractResponse = {
  id: string;
  agreementId: string;
  projectId: string;
  clientId: string;
  freelancerId: string;
  projectTitleSnapshot: string;
  agreedAmount: number;
  status: ContractStatus;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
};

type SignContractRequest = { ipAddress: string; userAgent: string };

type ConfirmPaymentRequest = {
  contractId: string;
  pgProvider: string;
  pgOrderId: string;
  pgPaymentKey: string;
};
type PaymentResponse = {
  id: string;
  contractId: string;
  currency: string;
  paymentAmount: number;
  platformFeeAmount: number;
  settlementAmount: number;
  status: PaymentStatus;
  paidAt: string | null;
  failureCode?: string;
  failureMessage?: string;
};

type RequestDeliveryRequest = { contractId: string; message?: string; attachmentUrl?: string };
type DeliveryResponse = {
  id: string;
  contractId: string;
  status: DeliveryStatus;
  requestedAt: string | null;
  approvedAt: string | null;
};
```
