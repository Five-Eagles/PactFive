# 스키마 2건 반영 — CR-AP-004 잔여(변경 1) · CR-CP-002 (2026-09-09)

## 한 일

**CR-AP-004 변경 1** (applications, 조준영) — `application_operation_steps`에
`(operation_id, name)` 유니크 제약 추가. 방어용 추가다 — 현재 이식 코드(전량 삭제 후
재삽입)가 이미 이 불변식을 지키고 있어 코드 변경은 없다. (변경 2는 #195에서 이미 반영
완료.)

**CR-CP-002** (contracts-payments, 조준영) — `payments`에 `platform_fee_rate_bps`
(smallint, default 1000) · `fee_policy_version` (varchar(30), default 'fee-policy-v1') ·
`pg_cost_amount` (integer, default 0) 3컬럼 신설. `toPaymentRow`의
`platformFeeAmount ÷ paymentAmount` 역산 로직을 제거하고 저장된 값을 직접 읽도록 변경.
`savePayment`의 create 분기에서 `platformFeeRateBps`를 쓰도록 추가(update 분기는
의도적으로 제외 — 생성 시 스냅샷, 이후 불변). 프로세스 재시작에도 살아남는 멱등 판정을
위한 `payment_idempotency_records` 테이블(`idempotency_key varchar(120) PK`, `scope`,
`body_hash`, `created_at`)을 신설 — **테이블만** 만들었고 `getIdempotent`/
`setIdempotent` 배선은 CR이 스스로 밝힌 범위 밖이라 하지 않았다.

**부수 수정** — `docs/domain/erd.md`·`erd-v1.4.dbml`에 위 변경 전부 반영. 그 과정에서
`application_closures.result`가 #195에서 이미 `varchar(20)`으로 바뀌었는데도 이 문서
표만 여전히 `jsonb`로 남아 있던 것을 발견해 함께 정정했다(스키마 자체는 이미 맞았다 —
문서만 갱신이 안 돼 있었다).

## 파일

- `app/server/prisma/schema.prisma`
- `app/server/prisma/migrations/20260909130000_application_operation_step_name_unique/`
- `app/server/prisma/migrations/20260909130100_payment_fee_snapshot_and_idempotency/`
- `app/server/src/features/contracts-payments/prisma-contracts-payments.repository.ts`
- `docs/domain/erd.md`, `docs/domain/reference/erd-v1.4.dbml`
- `features/applications/change-requests/0004-operation-step-uniqueness-closure-result-type.md`
  (닫음)
- `features/contracts-payments/change-requests/0002-payment-fee-snapshot-columns.md` (닫음)

## 검증

- `npx tsc --noEmit`(app/server): **2건** 에러, 둘 다
  `prisma-contracts-payments.repository.ts`(209·349행)에서 `platformFeeRateBps`가
  Prisma 생성 타입에 없다는 오류. schema.prisma는 이미 고쳐져 있고, 이 sandbox는
  네트워크 제한으로 `prisma generate`를 실행할 수 없다(#176과 같은 사유) — **로컬에서
  `npx prisma generate` 한 번이면 사라지는, 예상된 전이 상태다.**
- `npx tsx --test app/server/tests/project-pricing-registration.test.ts`: 8/8 PASS
  (이 테스트는 contracts-payments Prisma 코드를 건드리지 않아 영향 없음을 확인하는
  용도).

## 담당자별 영향/리스크

**조준영 (applications)** — 코드 변경 없음. CR-AP-004 완전히 닫힘(변경 1·2 모두).
해야 할 일 없음.

**조준영 (contracts-payments)** — 코드 변경 없음(팀장이 리포지토리 파일 직접 수정).
CR-CP-002는 스키마·역산 제거 부분만 닫혔다. **후속 작업 남음**: `getIdempotent`/
`setIdempotent`를 `payment_idempotency_records` 테이블로 배선하는 것은 별도 작업으로
남아 있다(지금은 여전히 프로세스 메모리 `Map` — 재시작하면 멱등 판정이 사라진다). 필요
시 새 CR로 요청.

**전체 팀 (특히 로컬에서 `app/server`를 빌드/테스트하는 사람)** — `git pull` 후
`npx prisma generate`를 반드시 재실행해야 tsc가 통과한다. 안 하면 위 2건의 에러가
그대로 보인다.

## A5 결정 (CR-AP-004) — 멱등 키 varchar 길이 통일 여부

**통일하지 않음.** `application_idempotency_keys.key`는 `varchar(160)` 그대로,
`payment_idempotency_records.idempotency_key`는 CR-CP-002 제안대로 `varchar(120)`
그대로 둔다. 이미 `project_contract_idempotency_records.idempotency_key varchar(100)` ·
`notifications.dedupe_key varchar(120)`처럼 테이블마다 길이가 혼재하는 게 기존 관행이고,
서로 다른 기능의 서로 다른 테이블이라 같은 컬럼에서 조인·비교되는 일도 없다. 강제로
통일해야 할 기술적 이유가 없다.

## 다음

`#203` — reviews 4단계(14일 window, CR-RV-002)로 진행.
