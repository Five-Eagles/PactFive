---
title: "payments 수수료 스냅샷 컬럼 신설 · 멱등 본문 해시 테이블"
status: "반영 완료"
requested_by: "조준영 (contracts-payments)"
date: "2026-09-09"
affected_docs: [docs/domain/erd.md, app/server/prisma/schema.prisma]
affected_features: [contracts-payments]
---

# 변경 검토요청서 — payments 수수료 스냅샷 · 멱등 본문 해시 (CR-CP-002)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (contracts-payments) |
| 날짜 | 2026-09-09 |
| ID | `CR-CP-002` |

> **닫음 (2026-09-09, 팀장).** A1~A4에 답한다.
>
> - **A1(예)** — `payments`에 `platform_fee_rate_bps smallint default 1000` ·
>   `fee_policy_version varchar(30) default 'fee-policy-v1'` ·
>   `pg_cost_amount integer default 0` 3컬럼을 추가했다. 전부 기본값이 있어 백필 없이
>   기존 행을 그대로 통과한다(지금까지의 결제는 전부 fee-policy-v1·1000bps라는 전제와
>   일치).
> - **A2(예)** — `prisma-contracts-payments.repository.ts`의 `toPaymentRow`에서
>   `platformFeeAmount ÷ paymentAmount` 역산을 지우고 저장된 `platformFeeRateBps`를 그대로
>   읽도록 고쳤다. `savePayment`의 `create` 분기에도 `platformFeeRateBps: row.platformFeeRateBps`를
>   추가했다 — `update` 분기에는 추가하지 않았다. spec.md 규칙 24("결제 생성 시 스냅샷",
>   "과거 결제는 정책이 바뀌어도 다시 나누지 않는다")와 `run.tsx`의 "규칙 24: 정책 변경
>   뒤 스냅샷 불변" 테스트를 지키려면 생성 시 한 번만 쓰고 그 뒤로는 불변이어야 한다.
> - **A3(예, 단 테이블만)** — `payment_idempotency_records` 테이블
>   (`idempotency_key varchar(120) PK`, `scope varchar(40)`, `body_hash varchar(64)`,
>   `created_at`)을 신설했다. **`getIdempotent`/`setIdempotent`를 이 테이블로 바꿔
>   붙이는 배선은 하지 않았다** — CR 본문이 스스로 밝힌 영향 범위(ERD·schema.prisma·
>   `toPaymentRow` 역산 제거·헤더 주석)에 배선이 포함돼 있지 않다. 지금은 여전히
>   프로세스 메모리 `Map`이 멱등 판정을 한다 — 재시작하면 사라진다는 한계가 남아
>   있다. 후속 작업으로 남긴다.
> - **A4(예)** — `feePolicyVersion`·`pgCostAmount`는 도메인 `PaymentRow` 타입에 아직
>   추가하지 않았다. 이 CR의 영향 범위가 스키마 3컬럼 신설과 `toPaymentRow`의
>   `platformFeeRateBps` 역산 제거로 한정돼 있어, 나머지 두 컬럼은 스키마 기본값을
>   그대로 두고 쓰기 로직을 새로 만들지 않았다. 필요해지면 별도 CR로 범위를 정해
>   요청해 달라.
>
> 확인 — `app/server` tsc는 지금 **2건**의 에러가 난다. 둘 다
> `prisma-contracts-payments.repository.ts`(209행·349행)에서 `platformFeeRateBps`가
> Prisma 생성 타입에 없다는 오류다 — 샌드박스가 `prisma generate`를 실행할 수 없어서다
> (네트워크 제한으로 엔진 바이너리를 받지 못한다, #176과 같은 사유). schema.prisma는
> 이미 고쳐져 있으므로 **로컬에서 `npx prisma generate`를 한 번 돌리면 사라지는 에러다.**
> `contracts-payments` 코드에 새 결함이 생긴 게 아니다.
>
> 아래는 제기 당시 기록이다.

## 배경

`PrismaContractsPaymentsRepository.toPaymentRow`가 `platformFeeRateBps`를 저장 컬럼
없이 역산했다.

```ts
const platformFeeRateBps =
  row.paymentAmount > 0 ? Math.round((row.platformFeeAmount / row.paymentAmount) * 10_000) : 0;
```

고정 요율 1000bps 하나만 쓰는 동안은 반올림 오차가 가려져 "우연히 정확"했다. 그러나
spec.md 규칙 24가 이미 "결제 생성 시 스냅샷"을 요구하고 있고, 요율이 결제마다 달라지거나
결제 금액이 아주 작으면(정수 나눗셈 특성상) 역산이 조용히 틀린 값을 낸다.

## 제안

1. `payments`에 3컬럼 추가: `platform_fee_rate_bps smallint default 1000`,
   `fee_policy_version varchar(30) default 'fee-policy-v1'`, `pg_cost_amount integer default 0`.
2. `toPaymentRow`의 역산 로직 제거, 저장된 값을 직접 읽도록 변경.
3. 결제 생성 시 한 번만 쓰고 이후 업데이트 경로에서는 절대 갱신하지 않는다(불변 스냅샷).
4. 멱등 처리가 프로세스 재시작에도 살아남도록 `payment_idempotency_records` 테이블
   신설 — 응답 전체가 아니라 본문 해시만 저장해 "같은 키·다른 본문 → 409" 판정만
   복구한다. **테이블 신설까지만 이 CR의 범위이며, 실제 배선은 별도 작업이다.**

## 영향 범위

- `docs/domain/erd.md` — `payments` 표 3행 추가, `payment_idempotency_records` 신규 절
- `app/server/prisma/schema.prisma` — `Payment` 모델 3필드, `PaymentIdempotencyRecord` 모델 신설
- `app/server/src/features/contracts-payments/prisma-contracts-payments.repository.ts` —
  `toPaymentRow` 역산 제거 + 헤더 주석 갱신
- **범위 밖**: `getIdempotent`/`setIdempotent` 배선, `feePolicyVersion`/`pgCostAmount` 쓰기 로직

## 확인 질문

| # | 질문 | 예 | 아니오 |
|---|---|---|---|
| A1 | 3컬럼 신설이 맞는가 (기본값 백필) | 예 | |
| A2 | `toPaymentRow` 역산 제거가 맞는가 | 예 | |
| A3 | `payment_idempotency_records` 테이블만 신설하고 배선은 후속으로 미루는가 | 예 | |
| A4 | `feePolicyVersion`/`pgCostAmount`는 이번엔 도메인 타입에 안 넣는가 | 예 | |
