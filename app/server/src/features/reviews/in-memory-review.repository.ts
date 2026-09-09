import type { ReviewRepository, ReviewRow } from './review.types';

/**
 * 2026-09-08 팀장 반영: ReviewRepository가 Promise 반환으로 바뀌면서, 이미 동기로 계산한
 * 값을 Promise.resolve로 감싸기만 했다 — 내부 로직·자료구조는 그대로다.
 */
export class InMemoryReviewRepository implements ReviewRepository {
  private reviews: ReviewRow[] = [];
  private idempotency = new Map<string, { bodyHash: string; reviewId: string }>();
  private seq = 200;

  async getReviewsByProject(projectId: string): Promise<ReviewRow[]> {
    return this.reviews.filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
  }

  async getReview(reviewId: string): Promise<ReviewRow | undefined> {
    const row = this.reviews.find((item) => item.reviewId === reviewId);
    return row ? { ...row } : undefined;
  }

  async getAllReviews(): Promise<ReviewRow[]> {
    return this.reviews.map((row) => ({ ...row }));
  }

  async insertReview(row: ReviewRow): Promise<void> {
    this.reviews.push({ ...row });
  }

  async markReviewCreatedPublished(reviewId: string, publishedAt: string): Promise<void> {
    const row = this.reviews.find((item) => item.reviewId === reviewId);
    if (row) row.reviewCreatedPublishedAt = publishedAt;
  }

  async getIdempotency(key: string): Promise<{ bodyHash: string; reviewId: string } | undefined> {
    const cached = this.idempotency.get(key);
    return cached ? { ...cached } : undefined;
  }

  async setIdempotency(key: string, bodyHash: string, reviewId: string): Promise<void> {
    this.idempotency.set(key, { bodyHash, reviewId });
  }

  async nextReviewId(): Promise<string> {
    this.seq += 1;
    return `rvw_${this.seq}`;
  }
}
