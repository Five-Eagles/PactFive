import { DAY_MS, SOLO_PUBLIC_AFTER_DAYS } from './review.constants';
import type { ReviewRepository, ReviewRow, ReviewWindow } from './review.types';

/**
 * 2026-09-08 팀장 반영: ReviewRepository가 Promise 반환으로 바뀌면서, 이미 동기로 계산한
 * 값을 Promise.resolve로 감싸기만 했다 — 내부 로직·자료구조는 그대로다.
 *
 * 2026-09-09 반영(CR-RV-002, #203): ensureWindow/getWindow 추가. 단일 프로세스 Map이라
 * 원본(조준영, review.mock.ts)과 마찬가지로 락 없이도 안전하다 — Node는 async 함수 사이에서만
 * 양보하고, 이 두 메서드 안에는 await가 없다.
 */
export class InMemoryReviewRepository implements ReviewRepository {
  private reviews: ReviewRow[] = [];
  private idempotency = new Map<string, { bodyHash: string; reviewId: string }>();
  private windows = new Map<string, ReviewWindow>();
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

  async ensureWindow(projectId: string, completedAt: string): Promise<ReviewWindow> {
    const existing = this.windows.get(projectId);
    if (existing) return { ...existing };
    const row: ReviewWindow = {
      projectId,
      openedAt: completedAt,
      deadlineAt: new Date(Date.parse(completedAt) + SOLO_PUBLIC_AFTER_DAYS * DAY_MS).toISOString(),
      policyVersion: 1,
    };
    this.windows.set(projectId, row);
    return { ...row };
  }

  async getWindow(projectId: string): Promise<ReviewWindow | undefined> {
    const row = this.windows.get(projectId);
    return row ? { ...row } : undefined;
  }
}
