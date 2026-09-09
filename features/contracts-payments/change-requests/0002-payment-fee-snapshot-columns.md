---
title: "결제 수수료 스냅샷 3컬럼과 멱등 본문 해시를 스키마에 넣는다"
status: "제안"
requested_by: "조준영 (contracts-payments)"
date: "2026-09-09"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [contracts-payments]
---

# 변경 검토요청서 — 수수료 스냅샷 컬럼 (CR-CP-002)

| | |
|---|---|
| 받는 사람 | 팀장 · 김락원 (ERD) |
| 보내는 사람 | 조준영 (contracts-payments) |
| 날짜 | 2026-09-09 |
| 상태 | 제안 |
| ID | `CR-CP-002` |
| 근거 | spec 규칙 24 「결제 생성 시 스냅샷」 · `feedback_loop/2026-09-08/contracts-payments.md` 항목 2 |

`app/`·`schema.prisma`·ERD는 팀장·김락원이 수정한다. 이 문서는 요청만 한다.

## 배경 (왜 필요한가)

2026-09-08 Prisma 이식(PR #92)에서 `PrismaContractsPaymentsRepository`가 도메인
`PaymentRow`의 세 값을 저장할 컬럼을 찾지 못해 **역산 또는 생략**으로 흡수했다.

팀장 메모는 "정산 요율이 향후 결제마다 달라질 계획이 있다면"이라는 조건을 달았는데,
**그 계획은 이미 코드와 통과 중인 테스트에 있다.** 미래 대비가 아니라 지금 규칙을 지킬 수
없는 상태다.

## 현재 스펙

- spec 규칙 24 — 「수수료 `floor(paymentAmount × 1000 / 10000)`, **결제 생성 시 스냅샷**」.
  「PG 비용은 정산액에서 빼지 않는다」.
- `prototype/server/settlement-fee.ts` — 「과거 결제는 다시 나누지 않는다」.
  `DEFAULT_PLATFORM_FEE_RATE_BPS = 1000` · `DEFAULT_FEE_POLICY_VERSION = "fee-policy-v1"`.
- `prototype/mock/payment-record.mock.ts` — `platformFeeRateBps` · `feePolicyVersion` ·
  `pgCostAmount`를 결제 행에 들고 있고 `setFeePolicyVersion` · `setPgCostAmount`가 있다.
- `run.tsx` 「규칙 24: 정책 변경 뒤 스냅샷 불변」 — 정책을 `fee-policy-v2`로 바꾼 뒤에도
  `platformFeeAmount` · `settlementAmount`가 그대로인지 검증한다. **통과 중이다.**
- `api-contract.md` `GetSettlementResponse`에 `platformFeeRateBps`가 있다 — 공개 응답 필드다.

## 현재 스키마에 없는 것

`app/server/prisma/schema.prisma`의 `Payment` 모델에는 `platform_fee_amount` ·
`settlement_amount`만 있다. 세 값이 없다.

| 도메인 값 | 지금 처리 | 문제 |
|---|---|---|
| `platformFeeRateBps` | `platformFeeAmount ÷ paymentAmount × 10000` 역산 | 버림 때문에 되돌릴 수 없는 계산 |
| `feePolicyVersion` | 저장 안 함 | 어느 정책으로 계산했는지 감사 불가 |
| `pgCostAmount` | 저장 안 함 | 정산 원장에 PG 비용이 안 남는다 |

역산이 지금 맞는 이유는 우연이다. `platformFeeAmount`는 버림이라 나머지가 사라지고,
결제 금액이 1만 원 이상일 때 `Math.round`가 그 오차를 덮는다. 요율이 `1000`이 아니게 되는
순간, 또는 소액 결제가 생기는 순간 조용히 틀린 값이 공개 응답으로 나간다.

## 제안하는 변경

**1. `payments`에 3컬럼 추가**

| 컬럼 | 타입 | 기본값 | 근거 |
|---|---|---|---|
| `platform_fee_rate_bps` | `smallint` NOT NULL | `1000` | 규칙 24 스냅샷 |
| `fee_policy_version` | `varchar(30)` NOT NULL | `'fee-policy-v1'` | `DEFAULT_FEE_POLICY_VERSION` |
| `pg_cost_amount` | `integer` NOT NULL | `0` | 규칙 24 PG 비용 기록 |

세 값은 **결제 생성 시 한 번 쓰고 다시 쓰지 않는다.** 정책이 바뀌어도 과거 행은 그대로 둔다
(`run.tsx`가 검증하는 불변식). 기본값이 있으므로 기존 행 백필이 필요 없다 — 지금까지의
결제는 전부 `fee-policy-v1` · 1000bps다.

`platform_fee_amount`는 그대로 둔다. 요율에서 다시 계산하지 않는다 — 버림 결과 자체가
스냅샷이어야 재계산으로 1원이 흔들리지 않는다.

**2. 범용 멱등 캐시의 본문 해시를 저장한다**

`getIdempotent`/`setIdempotent`가 `PrismaContractsPaymentsRepository` 안의 in-memory Map으로
남아 있다(항목 2의 3번). **재시작 후 응답 재사용이 안 되는 것은 받아들인다** — CAS·유니크
제약으로 데이터 정합성은 지켜지고, 재처리 결과가 같다.

받아들일 수 없는 것은 **「같은 키·다른 본문 409」**(규칙 23·25)다. 캐시가 비면 이 판정을 할 수
없고, 다른 본문이 그대로 통과한다. Mock은 `{ bodyHash, response }`를 함께 저장해 막는다
(`public-api.mock.ts:1248·1284`).

응답 전체를 저장할 필요는 없다. 키와 본문 해시만 남기면 409 판정은 복구된다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `idempotency_key` | `varchar(120)` PK | 합의·서명·납품·취소 공용 |
| `scope` | `varchar(40)` NOT NULL | 어느 흐름의 키인지 |
| `body_hash` | `varchar(64)` NOT NULL | 같은 키·다른 본문 판정 |
| `created_at` | `timestamptz` NOT NULL | |

`invalidations`(E-48)에도 같은 뿌리의 구멍이 있다. `cancellation_id`가 PK라 중복 처리는
막히지만 본문 해시가 없어 다른 본문을 걸러내지 못한다. 위 테이블을 쓰면 함께 닫힌다.

## 영향 범위

- `docs/domain/reference/erd-v1.4.dbml` · `docs/domain/erd.md` — `payments` 3컬럼, 멱등 테이블 신설
- `app/server/prisma/schema.prisma` — `Payment` 3필드, 신규 모델 1개 (팀장)
- `app/server/src/features/contracts-payments/prisma-contracts-payments.repository.ts` —
  `toPaymentRow`의 역산 제거, 파일 헤더 주석 3번 갱신 (팀장)
- `features/contracts-payments/` — 고칠 것 없음. Mock이 이미 이 모양이다
- 마이그레이션 위험 없음 — 세 컬럼 모두 기본값이 있고 아직 `prisma migrate dev` 전이다

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `payments`에 3컬럼을 추가하는가 | | | |
| A2 | 세 값은 결제 생성 시 1회 기록·이후 불변인가 | | | |
| A3 | `platform_fee_amount`를 요율에서 재계산하지 않는가 | | | |
| A4 | 멱등 본문 해시를 테이블로 남기는가 | | | |

## 대안으로 검토했던 것

- **역산 유지.** 지금 값이 맞는 것은 버림 오차가 `Math.round`에 덮이는 우연이다. 요율이
  바뀌거나 소액이 생기면 공개 응답이 조용히 틀린다. 기각.
- **`platform_fee_amount`를 요율에서 매번 재계산.** 버림 결과가 스냅샷이어야 한다는 규칙
  24와 어긋나고, 재계산 시점의 반올림 차이로 1원이 흔들린다. 기각.
- **요율만 추가하고 `fee_policy_version`은 생략.** 요율이 같아도 정책이 다를 수 있다(PG 비용
  처리·부가세 기준). 감사에서 어느 정책이었는지 못 밝힌다. 기각.
- **멱등 응답 전체를 JSON으로 저장.** 흐름마다 응답 모양이 달라 컬럼 계약이 흐려진다.
  409 판정만 복구하면 되므로 해시만 남긴다. 기각.
