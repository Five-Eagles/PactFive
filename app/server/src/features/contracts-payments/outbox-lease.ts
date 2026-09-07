/**
 * 메모리 Outbox — 납품 승인 등 도메인 커밋 이후에 발행하는 후속 이벤트(알림 트리거)를
 * "적어도 한 번" 전달하기 위한 리스·완료 패턴. 원본: prototype/server/outbox-lease.ts (28471d6, #80).
 *
 * F09(spec.md 규칙 26): leaseToken이 일치할 때만 완료 처리한다 — 다른 워커가 리스를 뺏어간
 * 이벤트를 원래 워커가 실수로 완료 처리하지 못하게 막는다. Prisma 전환 전까지는 프로세스
 * 재시작 시 유실되는 순수 메모리 큐다(app/server/prisma/schema.prisma가 비어 있는 동안의
 * 임시 저장소 — in-memory-contracts-payments.repository.ts와 같은 자리).
 */

export type MemoryOutboxEvent = {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  aggregateId: string;
  occurredAt: string;
  payload: unknown;
  availableAt: string;
  leaseUntil: string | null;
  leaseToken: string | null;
  attempts: number;
  deliveredAt: string | null;
};

export type EnqueueOutboxInput = {
  eventId: string;
  eventType: string;
  aggregateId: string;
  occurredAt: string;
  payload?: unknown;
};

/** 메모리 Outbox. leaseToken이 같을 때만 완료한다. */
export function createMemoryOutbox() {
  const events = new Map<string, MemoryOutboxEvent>();
  const inbox = new Map<string, string>();

  function enqueue(input: EnqueueOutboxInput): MemoryOutboxEvent {
    const existing = events.get(input.eventId);
    if (existing) return existing;
    const row: MemoryOutboxEvent = {
      eventId: input.eventId,
      eventType: input.eventType,
      schemaVersion: 1,
      aggregateId: input.aggregateId,
      occurredAt: input.occurredAt,
      payload: input.payload ?? {},
      availableAt: input.occurredAt,
      leaseUntil: null,
      leaseToken: null,
      attempts: 0,
      deliveredAt: null,
    };
    events.set(input.eventId, row);
    return row;
  }

  function claim(nowIso: string, leaseMs: number, token: string): MemoryOutboxEvent | null {
    const now = Date.parse(nowIso);
    for (const row of events.values()) {
      if (row.deliveredAt) continue;
      if (row.leaseUntil && Date.parse(row.leaseUntil) > now) continue;
      row.leaseToken = token;
      row.leaseUntil = new Date(now + leaseMs).toISOString();
      row.attempts += 1;
      return { ...row };
    }
    return null;
  }

  function complete(eventId: string, token: string, nowIso: string): boolean {
    const row = events.get(eventId);
    if (!row || row.leaseToken !== token) return false;
    row.deliveredAt = nowIso;
    return true;
  }

  function rememberInbox(consumerName: string, eventId: string, processedAt: string): boolean {
    const key = `${consumerName}:${eventId}`;
    if (inbox.has(key)) return false;
    inbox.set(key, processedAt);
    return true;
  }

  function list(): MemoryOutboxEvent[] {
    return [...events.values()].map((row) => ({ ...row }));
  }

  return { enqueue, claim, complete, rememberInbox, list };
}
