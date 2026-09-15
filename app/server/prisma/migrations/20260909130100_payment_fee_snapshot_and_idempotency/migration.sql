-- CR-CP-002(조준영, 2026-09-09) — payments 수수료 스냅샷 3컬럼 + 멱등 본문 해시 테이블
--
-- 배경: PrismaContractsPaymentsRepository가 platformFeeRateBps를 저장할 컬럼이 없어
-- platformFeeAmount÷paymentAmount로 역산했다(2026-09-08 6기능 Prisma 이식 트랙). 고정
-- 요율 하나만 쓰는 동안은 버림 오차가 반올림에 덮여 우연히 정확했지만, 요율이 결제마다
-- 달라지면(spec.md 규칙 24가 이미 "결제 생성 시 스냅샷"을 요구하고, run.tsx의
-- "규칙 24: 정책 변경 뒤 스냅샷 불변" 테스트가 통과 중이다) 조용히 틀린 값이 공개
-- 응답으로 나간다.

-- 1) payments에 3컬럼 추가 — 전부 기본값이 있어 기존 행 백필이 필요 없다
--    (지금까지의 결제는 전부 fee-policy-v1·1000bps다).
ALTER TABLE "payments"
  ADD COLUMN "platform_fee_rate_bps" SMALLINT NOT NULL DEFAULT 1000,
  ADD COLUMN "fee_policy_version" VARCHAR(30) NOT NULL DEFAULT 'fee-policy-v1',
  ADD COLUMN "pg_cost_amount" INTEGER NOT NULL DEFAULT 0;

-- 2) 멱등 본문 해시 테이블 신설 — 합의·서명·납품·취소 4개 흐름이 공용으로 쓰는
--    getIdempotent/setIdempotent(지금은 프로세스 메모리 Map만)가 재시작하면 "같은 키·
--    다른 본문은 409" 판정을 할 수 없게 된다. 응답 전체가 아니라 몸통 해시만 저장해
--    409 판정만 복구한다 — 이 마이그레이션은 테이블만 만든다. getIdempotent/
--    setIdempotent를 이 테이블로 바꿔 붙이는 배선은 별도 작업이다(CR-CP-002 영향 범위 밖).
CREATE TABLE "payment_idempotency_records" (
  "idempotency_key" VARCHAR(120) NOT NULL,
  "scope"           VARCHAR(40)  NOT NULL,
  "body_hash"       VARCHAR(64)  NOT NULL,
  "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "payment_idempotency_records_pkey" PRIMARY KEY ("idempotency_key")
);
