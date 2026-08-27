# contracts-payments — API 계약

형식은 `docs/naming-convention.md` §6·§7. 함수명이 정본(D-48).
내부 4함수는 `/internal/v1/projects/:projectId/...` (FACT, J1), 서버 간 토큰.
공개 API는 `/api/v1/...`, 사용자 Bearer. 프론트 설계서 `/agreements` 5종은 **폐기**.
`Authorization: Bearer <serviceToken>`. Mock 고정값은 `MOCK_INTERNAL_SERVICE_TOKEN`.
불일치면 422 `VALIDATION_ERROR`. 공개 입구 `prototype/index.ts`.

시각 ISO 8601 UTC `Z`. 성공·멱등 재처리 모두 **200**. 4xx는 아래 에러 봉투.

```json
{ "error": { "code": "PROJECT_TRANSITION_CONFLICT",
  "message": "프로젝트 상태가 변경되어 처리할 수 없습니다.", "details": null } }
```

| code | HTTP | 언제 |
|---|---|---|
| `PROJECT_NOT_FOUND` | 404 | 없음 또는 소프트 삭제 |
| `PROJECT_TRANSITION_CONFLICT` | 409 | 허용 상태 아님. `CANCELED` 포함. start 시 `acceptedApplicationId` null |
| `PROJECT_VERSION_CONFLICT` | 409 | `expectedProjectVersion` 불일치 |
| `PROJECT_ALREADY_RESTORED` | 409 | restore, 다른 협상으로 이미 복원 |
| `VALIDATION_ERROR` | 422 | 필수 누락·`reason` 오류. `details`에 필드별 사유 |

`CANCELED` 전용 코드는 없다 (D-31). 화면 분기는 409 후 negotiation-context 재조회.

공통 요청 필드: `requestId`, `idempotencyKey`, `occurredAt`.
`expectedProjectVersion`은 start·complete **필수**, restore·markPaymentPending은 선택 (J3).
공통 응답 필드: `alreadyProcessed`, `processedAt`, `changed`, `projectVersion`.

---

## GET /internal/v1/projects/:projectId/negotiation-context

규칙 2. `start`/`complete`/`markPaymentPending` 전 조회.
`acceptedApplicationId`가 계약의 지원서와 같은지는 **호출자가 대조**한다 (S2).

응답 200:

```json
{
  "projectId": "prj_123", "clientId": "usr_client_a",
  "recruitmentStatus": "CLOSED", "transactionStatus": "CONTRACT_PENDING",
  "acceptedApplicationId": "app_123",
  "recruitmentDeadlineAt": "2026-09-16T14:59:59Z",
  "canceledAt": null, "paymentPendingAt": null, "projectVersion": 7
}
```

에러: 404 `PROJECT_NOT_FOUND`.

---

## POST /internal/v1/projects/:projectId/mark-payment-pending

규칙 6. PG 요청 **직전**. 본문 `contractId` 필수 (P3). 멱등 키
`payment-pending-{contractId}` — 키에서 ID를 파싱하지 않는다.

요청:

```json
{
  "contractId": "ctr_123",
  "requestId": "req_pay_pending_01",
  "idempotencyKey": "payment-pending-ctr_123",
  "occurredAt": "2026-08-25T05:00:00Z"
}
```

응답 200 (최초):

```json
{
  "projectId": "prj_123", "transactionStatus": "CONTRACT_PENDING",
  "paymentPendingAt": "2026-08-25T05:00:00Z",
  "alreadyProcessed": false, "processedAt": "2026-08-25T05:00:00Z",
  "changed": true, "projectVersion": 7
}
```

상태를 안 바꾸므로 버전은 그대로다. 이미 기록돼 있으면 `changed: false`,
`alreadyProcessed: true`, **시각은 최초값 유지** (P4).

에러: 404. 409 `PROJECT_TRANSITION_CONFLICT` (`CONTRACT_PENDING` 아님/`CANCELED`).
409 `PROJECT_VERSION_CONFLICT`. 422.

---

## POST /internal/v1/projects/:projectId/start-transaction

규칙 3. `SIGNED` ∧ `PAID` 직후. **가장 먼저 붙이는 함수.**
멱등 키 `transaction-start-{contractId}`. 본문에 `acceptedApplicationId` 없음.
`expectedProjectVersion` 필수.

요청:

```json
{
  "requestId": "req_start_01",
  "idempotencyKey": "transaction-start-ctr_123",
  "occurredAt": "2026-08-25T05:01:00Z", "expectedProjectVersion": 7
}
```

응답 200 (최초):

```json
{
  "projectId": "prj_123", "recruitmentStatus": "CLOSED",
  "transactionStatus": "IN_PROGRESS",
  "alreadyProcessed": false, "processedAt": "2026-08-25T05:01:00Z",
  "changed": true, "projectVersion": 8
}
```

이미 `IN_PROGRESS` 또는 같은 키면 200, `changed: false`, `alreadyProcessed: true`.

에러: 404. 409 `PROJECT_TRANSITION_CONFLICT` (`CANCELED` 포함, 또는
`CONTRACT_PENDING`인데 `acceptedApplicationId`가 null — S3).
409 `PROJECT_VERSION_CONFLICT`. 422.

---

## POST /internal/v1/projects/:projectId/complete-transaction

규칙 4. `APPROVED` ∧ `RELEASED` 직후. 멱등 키 `transaction-complete-{contractId}`.
`expectedProjectVersion` 필수. I-30은 **호출자가 호출 전에 지킴.**

요청:

```json
{
  "requestId": "req_complete_01",
  "idempotencyKey": "transaction-complete-ctr_123",
  "occurredAt": "2026-08-25T06:00:00Z", "expectedProjectVersion": 8
}
```

응답 200 (최초):

```json
{
  "projectId": "prj_123", "recruitmentStatus": "CLOSED",
  "transactionStatus": "COMPLETED",
  "alreadyProcessed": false, "processedAt": "2026-08-25T06:00:00Z",
  "changed": true, "projectVersion": 9
}
```

이미 `COMPLETED`면 200 멱등. `CANCELED`면 409. 호출자가 409를 받으면 context를 다시 읽어
이미 `COMPLETED`면 성공으로 친다.

에러: 404. 409 `PROJECT_TRANSITION_CONFLICT` / `PROJECT_VERSION_CONFLICT`. 422.

---

## POST /internal/v1/projects/:projectId/restore-pre-contract

규칙 5. 최신 제안 수신자의 최종 거절만. 멱등 키 `negotiation-reject-{negotiationId}`.
합의·계약을 취소하지 않는다. `recruitment_start_at`은 건드리지 않는다 (A-13만).

요청:

```json
{
  "negotiationId": "ngt_123", "offerId": "off_3",
  "actorUserId": "usr_freelancer_b", "reason": "FREELANCER_REJECTED",
  "requestId": "req_restore_01",
  "idempotencyKey": "negotiation-reject-ngt_123",
  "occurredAt": "2026-08-25T04:30:00Z"
}
```

`offerId`만 생략 가능. `reason`은 `FREELANCER_REJECTED` \| `CLIENT_REJECTED`.
`expectedProjectVersion`은 선택.

응답 200 (재개):

```json
{
  "projectId": "prj_123", "negotiationId": "ngt_123",
  "recruitmentStatus": "OPEN", "transactionStatus": "NONE",
  "reopened": true, "notReopenedReason": null,
  "restoredFields": ["recruitmentStatus", "transactionStatus"],
  "alreadyProcessed": false, "processedAt": "2026-08-25T04:30:00Z",
  "changed": true, "projectVersion": 8
}
```

마감 지남: `reopened: false`, `notReopenedReason: "DEADLINE_PASSED"`.
대기 지원 잔존: `reopened: false`, `notReopenedReason: "PENDING_APPLICATIONS_REMAIN"`.
둘 다 `recruitmentStatus: "CLOSED"`. 대기 지원이 있으면 유동우가
`rejectPendingApplications`를 재요청한다. 같은 `negotiationId`는 최초 응답 +
`alreadyProcessed: true`.

에러: 404. 409 `PROJECT_TRANSITION_CONFLICT`. 409 `PROJECT_ALREADY_RESTORED`.
409 `PROJECT_VERSION_CONFLICT`. 422.

---

## 공개 API 초안 (규칙 16, Increment 1)

브라우저. `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
컨트롤러 구현은 다음 스프린트.

### POST /api/v1/projects/:projectId/negotiation-offers — `proposeNegotiationOffer`

의뢰인 최초 제안. 본문 `{ "amount": 900000, "currency": "KRW" }`.
멱등 키 클라이언트가 생성. 성공: `PROPOSED` offer, round 1.
Increment 1에서는 의뢰인만. 재제안은 계약에만 있고 이 Increment 테스트 밖.

### GET /api/v1/projects/:projectId/negotiation-offers/current

당사자. 최신 round + 합의 상태 + 있으면 `contractId`·`contractStatus`.

### POST /api/v1/projects/:projectId/negotiation-offers/:offerId/accept — `acceptNegotiationOffer`

최신 round 수신자. 본문 `{ "expectedRound": 1 }`. 규칙 11: 합의 `ACCEPTED` + 계약 `DRAFT`.
멱등 키 `negotiation-accept-{offerId}`.

### POST /api/v1/projects/:projectId/negotiation-offers/:offerId/reject — `rejectNegotiationOffer`

최신 round 수신자 최종 거절. 본문 `{ "reasonCode": "PRICE_NOT_ACCEPTABLE" }`.
서버가 규칙 5 restore를 호출한다. 멱등 키 `negotiation-reject-{negotiationId}`.

### POST /api/v1/contracts/:contractId/sign — `signContract`

규칙 13. 당사자. 멱등 키 `contract-sign-{contractId}-{signerId}`.
응답: `status` (`SIGNING` \| `SIGNED`), `clientSignedAt`, `freelancerSignedAt`, `signedAt`.

### POST /api/v1/payments — 결제 준비

규칙 6 이후. 계약 `SIGNED`. 서버가 `contracts.agreed_amount`를 복사해 주문 생성.
응답: `orderId`, `amount`, 위젯용 `clientKey`는 서버 시크릿이 아님.

### POST /api/v1/payments/confirm — `confirmPayment`

규칙 9. 본문 `{ "orderId", "amount", "paymentKey" }`. 성공 `PAID` 후 규칙 3 start.

에러(공개): 401/403, 404, 409 상태 충돌, 422. 결제 금액 불일치는 `PAYMENT_AMOUNT_MISMATCH`.
프로젝트 취소 후 서명은 409 `PROJECT_TRANSITION_CONFLICT` (화면: 취소 안내).

---

## DTO

```ts
type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
type ProjectTransactionStatus =
  | 'NONE' | 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
type RestoreReason = 'FREELANCER_REJECTED' | 'CLIENT_REJECTED';
type NotReopenedReason = 'DEADLINE_PASSED' | 'PENDING_APPLICATIONS_REMAIN';

type DomainContractEnvelopeInput = {
  requestId: string;
  idempotencyKey: string;
  occurredAt: string;
  expectedProjectVersion?: number;
};
type DomainContractEnvelopeResponse = {
  alreadyProcessed: boolean;
  processedAt: string;
  changed: boolean;
  projectVersion: number;
};

type ProjectNegotiationContextResponse = {
  projectId: string;
  clientId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  acceptedApplicationId: string | null;
  recruitmentDeadlineAt: string;
  canceledAt: string | null;
  paymentPendingAt: string | null;
  projectVersion: number;
};

type MarkPaymentPendingInput = DomainContractEnvelopeInput & {
  contractId: string;
};
type MarkPaymentPendingResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  transactionStatus: ProjectTransactionStatus;
  paymentPendingAt: string;
};

type StartProjectTransactionInput = DomainContractEnvelopeInput & {
  expectedProjectVersion: number;
};
type StartProjectTransactionResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: 'IN_PROGRESS';
};

type CompleteProjectTransactionInput = DomainContractEnvelopeInput & {
  expectedProjectVersion: number;
};
type CompleteProjectTransactionResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: 'COMPLETED';
};

type RestorePreContractProjectInput = DomainContractEnvelopeInput & {
  negotiationId: string;
  offerId?: string;
  actorUserId: string;
  reason: RestoreReason;
};
type RestorePreContractProjectResponse = DomainContractEnvelopeResponse & {
  projectId: string;
  negotiationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: 'NONE';
  reopened: boolean;
  notReopenedReason: NotReopenedReason | null;
  restoredFields: ['recruitmentStatus', 'transactionStatus'];
};

type AgreementStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED';
type ContractStatus = 'DRAFT' | 'SIGNING' | 'SIGNED' | 'CANCELED';

type ProposeNegotiationOfferInput = { amount: number; currency: 'KRW' };
type AcceptNegotiationOfferInput = { expectedRound: number };
type RejectNegotiationOfferInput = { reasonCode: string; reason?: string };
type SignContractInput = { contractId: string };
type SignContractResponse = {
  contractId: string;
  status: 'SIGNING' | 'SIGNED';
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
  alreadyProcessed: boolean;
};
type ConfirmPaymentInput = { orderId: string; amount: number; paymentKey: string };
type ConfirmPaymentResponse = {
  orderId: string;
  amount: number;
  paymentKey: string;
  status: 'PAID';
};

type DomainContractErrorBody = {
  error: {
    code:
      | 'PROJECT_NOT_FOUND'
      | 'PROJECT_TRANSITION_CONFLICT'
      | 'PROJECT_VERSION_CONFLICT'
      | 'PROJECT_ALREADY_RESTORED'
      | 'VALIDATION_ERROR';
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

/** 유동우 Mock이 구현, 조준영 Mock이 호출 */
type ProjectTransactionPort = {
  getProjectNegotiationContext(projectId: string): Promise<ProjectNegotiationContextResponse>;
  markPaymentPending(projectId: string, input: MarkPaymentPendingInput): Promise<MarkPaymentPendingResponse>;
  startProjectTransaction(projectId: string, input: StartProjectTransactionInput): Promise<StartProjectTransactionResponse>;
  completeProjectTransaction(projectId: string, input: CompleteProjectTransactionInput): Promise<CompleteProjectTransactionResponse>;
  restorePreContractProject(projectId: string, input: RestorePreContractProjectInput): Promise<RestorePreContractProjectResponse>;
};
```

해피패스 리터럴(`IN_PROGRESS`/`COMPLETED`/`NONE`)은 성공·멱등 재호출에 그대로 쓴다.
포트가 4xx를 낼 때 Mock 기본은 `DomainContractErrorBody`를 **throw**한다.
