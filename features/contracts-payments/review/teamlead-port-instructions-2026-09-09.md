# contracts-payments 이식 지시서 (2026-09-09)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (contracts-payments) |
| 목적 | 판단할 것을 남기지 않은 이식 지시 |

`app/`은 팀장님만 수정하므로 제가 커밋하지 않습니다.

우선순위는 **1 → 2 → 3 → 4** 순서입니다. 1·2번은 사용자가 지금 막히는 지점이고, 3번은
복구 경로, 4번은 멱등 정확도입니다.

---

## 1. 납품 파일 정보가 항상 `delivery.zip` · 0 bytes다

**원인** — `prepareDeliveryUpload`가 파일 정보를 **받지도 저장하지도 않습니다.**

`app/server/src/features/contracts-payments/public-api.service.ts:855~876`은 `sha256`만
검증하고 `objectKey`를 만들어 돌려줍니다. 원본은 `fileName`·`contentType`·`size`를 필수로
받아 검증하고 준비된 업로드에 **저장합니다** (`prototype/mock/public-api.mock.ts:1365~1392`).

그래서 `requestDelivery`(`:917~919`)의 fallback이 항상 걸립니다.

```ts
delivery.fileName = delivery.fileName ?? 'delivery.zip';        // 앞에서 채워진 적이 없다
delivery.mimeType = delivery.mimeType ?? 'application/octet-stream';
delivery.sizeBytes = delivery.sizeBytes ?? 0;
```

**고칠 것** — `PrepareDeliveryUploadInput`에 `fileName`·`contentType`·`size`를 추가하고,
원본과 같은 검증을 붙인 뒤 delivery 행에 저장합니다.

- `fileName`·`contentType` 빈 값이면 `VALIDATION_ERROR` (`field`는 비어 있는 쪽)
- `size`가 0 이하거나 `MAX_DELIVERY_FILE_BYTES` 초과면 `VALIDATION_ERROR`
- `sha256`은 지금처럼 64자 hex 검증. **저장도 해야 합니다** — 스키마의 `file_sha256`
  컬럼이 지금 한 번도 쓰이지 않습니다(`rg fileSha256 app/server/src` → 주석 1건)

`requestDelivery`의 `??` fallback 3줄은 그러면 지워도 됩니다. 값이 앞에서 정해집니다.

**증상** 납품 화면의 파일 정보가 실제 파일과 무관하게 항상 같은 값으로 보입니다.

---

## 2. 「다운로드」를 누르면 404다

**원인** — 응답이 만드는 경로가 라우터에 없습니다.

```ts
// public-api.service.ts:1028
downloadUrl: delivery.status === 'APPROVED' && isClient
  ? `/api/v1/contracts/${contractId}/delivery/download` : null,
```

`public-api.routes.ts`에는 `GET /api/v1/contracts/:contractId/delivery`(`:64`)만 있고
`/delivery/download`가 없습니다. 웹은 이 URL을 그대로 새 창으로 엽니다
(`app/web/src/features/contracts-payments/DeliveryPanel.tsx:123~124`).

**고칠 것** — 둘 중 하나입니다. 어느 쪽이든 지금 상태(404)보다 낫습니다.

- **라우트를 만든다** — 승인 상태·의뢰인 권한을 확인하고 저장소 서명 URL로 302. 다만
  실저장소가 스텁이라(`spec.md` 규칙 23) 지금은 리다이렉트할 대상이 없습니다
- **`downloadUrl`을 `null`로 둔다** — 실저장소가 붙기 전까지. 그러면 웹의
  `canDownload` 버튼도 비활성이 되어 사용자가 404를 만나지 않습니다

**저는 두 번째를 권합니다.** 규칙 23이 실저장소를 이 Increment 밖으로 두었으니, 없는 기능을
있는 것처럼 보여주지 않는 편이 맞습니다. 버튼을 감추면 「승인됐는데 받을 수 없다」가
드러나고, 그건 사실입니다.

---

## 3. 결제가 `PENDING`에 갇히면 스스로 못 빠져나온다

**웹훅 수신부가 없습니다.** `rg receivePaymentWebhook app/` → 0건. 원본에는 중복 방지
inbox까지 있습니다(`prototype/mock/public-api.mock.ts:1133~1147`). 규칙 14·21이 「웹훅은
조회 API로 재검증」을 요구합니다(`spec.md:205~206`·`:283~286`).

**`retrievePayment` 호출부가 없습니다.** 어댑터에는 구현이 있는데
(`toss-payments.adapter.ts:68`) 부르는 곳이 없습니다. 규칙 21은 「승인 timeout·유실은
`PENDING` 유지 후 `retrievePayment`로 복구」입니다(`spec.md:259~260`).

**고칠 것** — 순서는 `retrievePayment` 호출부가 먼저입니다. 웹훅보다 만들기 쉽고, 사용자가
결제 화면을 다시 열 때 조회로 복구할 수 있습니다. 웹훅은 서명 검증·재시도까지 필요해
분량이 큽니다.

**증상** 리다이렉트가 유실되면 결제가 `PENDING`에 남고 자동 복구가 없습니다.

---

## 4. 멱등 두 경로가 본문을 비교하지 않는다

`requestDelivery`는 제대로 합니다 — 캐시된 입력과 새 입력을 비교해 다르면 409
(`public-api.service.ts:892~898`).

**`approveDelivery`(`:950~951`)와 `invalidateAgreement`(`:777~779`)는 비교 없이 최초 응답을
그대로 돌려줍니다.**

```ts
const cached = await repo.getIdempotent<GetDeliveryResponse>('delivery-approve', input.idempotencyKey);
if (cached) return { ...cached, alreadyProcessed: true };   // 본문이 달라도 통과
```

규칙 23·25가 「같은 키·다른 본문은 409」를 요구합니다. `requestDelivery`처럼
`{ input, response }`를 함께 저장하고 비교하면 됩니다.

**본문 해시로 저장하는 편이 낫습니다** —
[CR-CP-002](../change-requests/0002-payment-fee-snapshot-columns.md)에서 이미 요청한
`body_hash` 테이블입니다. `JSON.stringify` 비교는 키 순서가 바뀌면 오탐합니다.

**멱등 캐시가 프로세스 메모리에만 있습니다** —
`prisma-contracts-payments.repository.ts:274~278`의 `new Map<...>`. 파일 주석(`:47~50`)도
「재시작하면 멱등 캐시가 비어 재처리될 수 있다」고 적어 두었습니다. 서버리스에서는
인스턴스마다 분리되므로 멱등이 사실상 동작하지 않습니다. CR-CP-002의 테이블이 이것도
같이 닫습니다.

---

## 5. 프로젝트 취소가 계약 무효화까지 가지 않는다

**파일** `app/server/src/features/project-management/in-memory-external.adapter.ts:140~149`

`createUnavailableContractsPort`가 무조건 `result: 'FAILED'`를 반환하고, `:192`에서 그것을
조립합니다. 인바운드는 이미 열려 있습니다
(`public-api.routes.ts:83` `POST /internal/v1/projects/:projectId/invalidate-agreement`).

**고칠 것** — `express-app.ts`에서 실제 포트를 물려주는 배선만 남았습니다. 제 쪽 구현은
끝나 있습니다.

**증상** 의뢰인이 프로젝트를 취소해도 합의가 `REJECTED`, 계약이 `CANCELED`로 바뀌지 않고
취소 조회의 `postActions.contractInvalidation`이 `FAILED`로 표시됩니다.

---

## 손대지 않는 것 (Increment 밖 합의)

- **정산 `RELEASED` 공개 트리거** — `feedback_loop/2026-09-07/contracts-payments-app-integration.md:36~39`에서
  제가 「공개 HTTP·지급 버튼·운영 화면은 이 Increment 밖. 팀장이 라우트를 안 연 것이 정본」으로
  확정했습니다. 다음은 웹훅·배치입니다
- 실저장소·실AV, PG 환불·`REFUNDED`, 에스크로, 제안 철회, 납품 반려·재납품

## 스키마 (CR-CP-002)

[CR-CP-002](../change-requests/0002-payment-fee-snapshot-columns.md)가
`platform_fee_rate_bps`·`fee_policy_version`·`pg_cost_amount` 3컬럼과 멱등 `body_hash`
테이블을 요청 중입니다. 지금은 요율을 `platformFeeAmount ÷ paymentAmount`로 역산합니다
(`prisma-contracts-payments.repository.ts:328~336`). 고정 요율 하나만 쓰는 동안은 값이
정확히 맞지만, 요율이 바뀌면 과거 결제의 근거가 사라집니다.

`invalidations` 테이블도 저장 컬럼이 4개뿐이라 규칙 25가 요구하는 응답 필드
(`cancellation_event_id`·`actor_user_id`·`reason`·`occurred_at`·`agreement_status`·
`contract_status`·`signatures_preserved`)를 담지 못합니다. 이건 CR-CP-002 범위 밖이라
9/08 피드백 항목 1에 제 검토 의견으로 적어 두었습니다.

## 제가 회신을 기다리는 것

- **CR-CP-001** (`getProjectNegotiationContext`의 `title`) — 유동우님 회신 대기.
  `projectTitle`이 계속 빈 문자열이라 결제·정산·취소·합의 4개 화면이 「프로젝트」로 표시됩니다
- **알림 4종 발송** — `review/external-wait-2026-08-31.md` §4의 Y1~Y5가 빈칸입니다. 저는
  `publish*`만 하고 발송은 팀장님 몫입니다
