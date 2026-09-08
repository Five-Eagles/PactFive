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
