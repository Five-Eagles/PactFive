---
title: "멱등 Map을 DB로 옮긴다 — payload 컬럼 · get/setIdempotent 배선"
status: "반영완료"
requested_by: "조준영 (contracts-payments)"
date: "2026-09-10"
resolved: "2026-09-11"
affected_docs: [docs/domain/erd.md, app/server/prisma/schema.prisma]
affected_features: [contracts-payments]
---

# 변경 검토요청서 — 멱등 캐시 영속화 (CR-CP-003)

| | |
|---|---|
| 상태 | **반영완료** (2026-09-11) |
| ID | `CR-CP-003` |

## 반영 요약

| 항목 | 결과 |
|---|---|
| A1 payload Json | `schema.prisma` + migration `20260911140000_…` |
| A2 PK `(scope, idempotency_key)` | 적용 |
| A3 body_hash nullable | 적용 |
| A4 테이블명 유지 | `payment_idempotency_records` |
| 배선 | `prisma-contracts-payments.repository.ts` Map 제거 |

확인: `npx tsx features/contracts-payments/review/idempotency-payload-smoke.ts`

---

(이하 원문 제안서)

`app/`은 팀장만 수정한다. 아래는 스키마 보완 + 리포지토리 배선 요청이다.

## 배경

CR-CP-002로 `payment_idempotency_records` 테이블이 생겼다. 그러나
`PrismaContractsPaymentsRepository`는 여전히 프로세스 메모리 `Map`이다
(`prisma-contracts-payments.repository.ts:61`, `getIdempotent`/`setIdempotent` `:287~291`).

**재시작하면 멱등 판정이 사라진다.** 도메인 CAS·유니크가 이중 적용을 막아 결과는 대체로
안전하지만, HTTP 재시도에서

- `alreadyProcessed: true` 재현이 안 되고
- 같은 키·다른 본문 → 409(규칙 23)가 재시작 뒤에는 통하지 않는다

는 한계가 남는다. CR-CP-002 A3가 이 배선을 후속으로 남겼다.

## 왜 지금 테이블만으로는 부족한가

현재 테이블:

```
idempotency_key PK · scope · body_hash · created_at
```

실제 Map이 담는 것:

| namespace (`scope`) | 저장값 |
|---|---|
| `accept` · `reject` · `sign` | 응답 객체 전체 |
| `invalidate` · `delivery-request` · `delivery-approve` | `{ input, response }` — 본문 비교에 `input` 필요 |

`body_hash`만으로는 **응답 재현**이 안 되고, delivery·invalidate의 **본문 비교**도
해시 계산 규칙을 호출부에서 다시 만들어야 한다. 지금 Map은 `JSON.stringify(cached.input)`
으로 비교한다(`public-api.service.ts` invalidate·delivery 경로).

이름도 `payment_*`인데 실제 scope는 합의·서명·납품·취소까지다. 결제 전용 테이블이 아니다.

## 제안

### 1. 컬럼 추가 — `payload Json NOT NULL`

`payment_idempotency_records`에 Map이 넣던 값을 그대로 둔다.

| 컬럼 | 역할 |
|---|---|
| `idempotency_key` | 기존 PK (키 단독). **또는** `(scope, idempotency_key)` 복합 PK로 바꾸는 편이 안전 — 아래에 |
| `scope` | namespace (`accept` …) |
| `body_hash` | **nullable로 완화**하거나 호출부가 넣을 때만 채움. 없어도 `payload`로 비교 가능 |
| `payload` | **신설.** `setIdempotent`의 `value` JSON |
| `created_at` | 기존 |

### 2. PK를 `(scope, idempotency_key)`로

지금은 `idempotency_key`만 PK다. 서로 다른 scope가 같은 키 문자열을 쓰면 충돌한다.
앱 Map 키는 이미 `` `${namespace}:${key}` `` 이다. DB도 그와 같아야 한다.

마이그레이션: 테이블이 **아직 비어 있다**(배선 전이라 행 없음). PK 변경 비용 없음.

### 3. 배선 — `getIdempotent` / `setIdempotent`

```ts
// get: findUnique({ scope_idempotencyKey: { scope: namespace, idempotencyKey: key } })
//      → payload 를 T 로 반환
// set: upsert 동일 키, payload: value as InputJsonValue
```

in-memory `Map` 필드는 제거한다. InMemory 구현은 테스트용 Map 유지해도 된다.

### 4. 호출부 변경은 없음

`public-api.service.ts`의 namespace·본문 비교 로직은 그대로 둔다. 저장소만 영속화한다.

## 영향 범위

- `docs/domain/erd.md` · `erd-v1.4.dbml` — 컬럼·PK
- `app/server/prisma/schema.prisma` + 마이그레이션
- `prisma-contracts-payments.repository.ts` — Map 제거, Prisma 읽기/쓰기
- **범위 밖**: `feePolicyVersion`/`pgCostAmount` 도메인 쓰기(CR-CP-002 A4), 결제 prepare
  전용 별도 해시 로직

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `payload Json`을 추가해 Map 값을 그대로 영속화하는가 | | | |
| A2 | PK를 `(scope, idempotency_key)`로 바꾸는가 | | | |
| A3 | `body_hash`는 nullable(또는 호출부가 채울 때만)로 두는가 | | | |
| A4 | 테이블 이름은 `payment_idempotency_records` 유지해도 되는가 (rename은 선택) | | | |

## 대안으로 검토했던 것

- **`body_hash`만 쓰고 응답은 재실행.** 재시작 후 409·`alreadyProcessed`가 깨진다. 기각.
- **namespace마다 테이블.** 지금 6개 scope·같은 인터페이스. 과함. 기각.
- **`project_contract_idempotency_records` 재사용.** PM 내부 트랜잭션용(`result`·
  `project_version`). 공개 API scope와 섞지 않는다. 기각.
