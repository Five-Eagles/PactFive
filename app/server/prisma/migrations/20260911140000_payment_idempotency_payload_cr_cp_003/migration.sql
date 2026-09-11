-- CR-CP-003(조준영, 2026-09-11) — payment_idempotency_records에 payload 추가,
-- PK를 (scope, idempotency_key)로 바꾸고 body_hash를 nullable로 완화한다.
--
-- 배선 전·마커만 있던 행은 응답 복구에 쓸 수 없으므로 비운다(테이블이 비어 있다는
-- CR 전제와 동일). 그다음 스키마를 Map 값 영속화에 맞게 고친다.

DELETE FROM "payment_idempotency_records";

ALTER TABLE "payment_idempotency_records"
  DROP CONSTRAINT "payment_idempotency_records_pkey";

ALTER TABLE "payment_idempotency_records"
  ALTER COLUMN "body_hash" DROP NOT NULL;

ALTER TABLE "payment_idempotency_records"
  ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "payment_idempotency_records"
  ALTER COLUMN "payload" DROP DEFAULT;

ALTER TABLE "payment_idempotency_records"
  ADD CONSTRAINT "payment_idempotency_records_pkey"
  PRIMARY KEY ("scope", "idempotency_key");
