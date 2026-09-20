/**
 * CR-CP-003 — Prisma idempotency payload round-trip (fake client).
 * 실행: npx tsx features/contracts-payments/review/idempotency-payload-smoke.ts
 */
import assert from 'node:assert/strict';
import { PrismaContractsPaymentsRepository } from '../../../app/server/src/features/contracts-payments/prisma-contracts-payments.repository';

type Row = {
  scope: string;
  idempotencyKey: string;
  bodyHash: string | null;
  payload: unknown;
  createdAt: Date;
};

async function main() {
  const store = new Map<string, Row>();
  const idOf = (scope: string, key: string) => `${scope}\0${key}`;

  const fakePrisma = {
    paymentIdempotencyRecord: {
      findUnique: async ({
        where,
      }: {
        where: { scope_idempotencyKey: { scope: string; idempotencyKey: string } };
      }) => {
        const { scope, idempotencyKey } = where.scope_idempotencyKey;
        return store.get(idOf(scope, idempotencyKey)) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { scope_idempotencyKey: { scope: string; idempotencyKey: string } };
        create: Row;
        update: Partial<Row>;
      }) => {
        const { scope, idempotencyKey } = where.scope_idempotencyKey;
        const k = idOf(scope, idempotencyKey);
        const prev = store.get(k);
        const next = prev
          ? { ...prev, ...update, scope, idempotencyKey }
          : { ...create, createdAt: create.createdAt ?? new Date() };
        store.set(k, next as Row);
        return next;
      },
    },
  };

  const a = new PrismaContractsPaymentsRepository(fakePrisma as never);
  await a.setIdempotent('sign', 'key', { ok: true, input: { round: 1 } });
  assert.deepEqual(await new PrismaContractsPaymentsRepository(fakePrisma as never).getIdempotent('sign', 'key'), {
    ok: true,
    input: { round: 1 },
  });
  await a.setIdempotent('accept', 'key', { other: true });
  assert.deepEqual(await a.getIdempotent('sign', 'key'), { ok: true, input: { round: 1 } });
  assert.deepEqual(await a.getIdempotent('accept', 'key'), { other: true });
  console.log('PASS CR-CP-003 idempotency payload smoke');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
