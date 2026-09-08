import type { PricingAnalysisRateLimitPort } from './pricing-analysis-rate-limit.port';

/**
 * 원본: features/ai-pricing/prototype/mock/in-memory-pricing-analysis-rate-limit.mock.ts (오민혁)
 *
 * 다른 기능들과 마찬가지로 지금은 인메모리 저장소만 쓰는 단계다 (in-memory-first,
 * CR-0007 선례). 공유 저장소 기반 시간 창 구현은 Prisma 도입 이후로 미룬다.
 */
export class InMemoryPricingAnalysisRateLimit implements PricingAnalysisRateLimitPort {
  private readonly consumed = new Map<string, number>();
  private readonly idempotencyScopes = new Map<string, string>();
  private commitTail: Promise<void> = Promise.resolve();

  constructor(private readonly limitPerUser = Number.POSITIVE_INFINITY) {}

  async consumeNewAnalysis(input: {
    requesterId: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<'ALLOWED' | 'LIMITED' | 'IDEMPOTENCY_KEY_REUSED'> {
    let release!: () => void;
    const previousCommit = this.commitTail;
    this.commitTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previousCommit;
    try {
      const scope = JSON.stringify([input.requesterId, input.idempotencyKey]);
      const reservedFingerprint = this.idempotencyScopes.get(scope);
      if (reservedFingerprint !== undefined) {
        return reservedFingerprint === input.requestFingerprint
          ? 'ALLOWED'
          : 'IDEMPOTENCY_KEY_REUSED';
      }
      const current = this.consumed.get(input.requesterId) ?? 0;
      if (current >= this.limitPerUser) return 'LIMITED';
      this.idempotencyScopes.set(scope, input.requestFingerprint);
      this.consumed.set(input.requesterId, current + 1);
      return 'ALLOWED';
    } finally {
      release();
    }
  }

  consumedBy(requesterId: string): number {
    return this.consumed.get(requesterId) ?? 0;
  }
}
