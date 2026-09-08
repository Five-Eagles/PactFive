import type { PricingAnalysisRateLimitPort } from "../server/pricing-analysis-rate-limit.port";

/** 테스트용 누적 한도. 운영 구현은 공유 저장소의 시간 창을 사용해야 한다. */
export class InMemoryPricingAnalysisRateLimit implements PricingAnalysisRateLimitPort {
  private readonly consumed = new Map<string, number>();
  private readonly idempotencyScopes = new Map<string, string>();
  private commitTail: Promise<void> = Promise.resolve();

  constructor(private readonly limitPerUser = Number.POSITIVE_INFINITY) {}

  async consumeNewAnalysis(input: {
    requesterId: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<"ALLOWED" | "LIMITED" | "IDEMPOTENCY_KEY_REUSED"> {
    let release!: () => void;
    const previousCommit = this.commitTail;
    this.commitTail = new Promise<void>((resolve) => { release = resolve; });
    await previousCommit;
    try {
      const scope = JSON.stringify([input.requesterId, input.idempotencyKey]);
      const reservedFingerprint = this.idempotencyScopes.get(scope);
      if (reservedFingerprint !== undefined) {
        return reservedFingerprint === input.requestFingerprint
          ? "ALLOWED"
          : "IDEMPOTENCY_KEY_REUSED";
      }
      const current = this.consumed.get(input.requesterId) ?? 0;
      if (current >= this.limitPerUser) return "LIMITED";
      this.idempotencyScopes.set(scope, input.requestFingerprint);
      this.consumed.set(input.requesterId, current + 1);
      return "ALLOWED";
    } finally {
      release();
    }
  }

  consumedBy(requesterId: string): number {
    return this.consumed.get(requesterId) ?? 0;
  }
}
