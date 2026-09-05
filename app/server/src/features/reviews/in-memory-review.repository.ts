import type { ReviewRepository, ReviewRow } from './review.types';

export class InMemoryReviewRepository implements ReviewRepository {
  private reviews: ReviewRow[] = [];
  private idempotency = new Map<string, { bodyHash: string; reviewId: string }>();
  private seq = 200;

  getReviewsByProject(projectId: string): ReviewRow[] {
    return this.reviews.filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
  }

  getReview(reviewId: string): ReviewRow | undefined {
    const row = this.reviews.find((item) => item.reviewId === reviewId);
    return row ? { ...row } : undefined;
  }

  getAllReviews(): ReviewRow[] {
    return this.reviews.map((row) => ({ ...row }));
  }

  insertReview(row: ReviewRow): void {
    this.reviews.push({ ...row });
  }

  markReviewCreatedPublished(reviewId: string, publishedAt: string): void {
    const row = this.reviews.find((item) => item.reviewId === reviewId);
    if (row) row.reviewCreatedPublishedAt = publishedAt;
  }

  getIdempotency(key: string): { bodyHash: string; reviewId: string } | undefined {
    const cached = this.idempotency.get(key);
    return cached ? { ...cached } : undefined;
  }

  setIdempotency(key: string, bodyHash: string, reviewId: string): void {
    this.idempotency.set(key, { bodyHash, reviewId });
  }

  nextReviewId(): string {
    this.seq += 1;
    return `rvw_${this.seq}`;
  }
}
