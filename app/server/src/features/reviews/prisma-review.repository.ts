import { randomUUID } from 'node:crypto';
import type { PrismaClient, Review as ReviewRecord } from '../../generated/prisma/client';
import type { ReviewRepository, ReviewRow } from './review.types';

/**
 * ReviewRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryReviewRepository와 동작을 최대한
 * 동일하게 맞췄다 — reviewId/reviews 테이블은 원본(조준영) 그대로고, 멱등 캐시는
 * review_idempotency_keys 테이블(오늘 신설, PRISMA-GAP-10)을 쓴다.
 *
 * nextReviewId()는 in-memory처럼 프로세스 내 카운터를 쓸 수 없다(여러 서버리스 인스턴스가
 * 동시에 돌 수 있어 충돌한다) — DB가 보장하는 유일성이 필요해 UUID 기반 접두 ID로 바꿨다.
 * 형식만 다르고(`rvw_숫자` → `rvw_UUID`) 의미는 같다(reviews.id, varchar(30) 안에 들어간다).
 */
export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getReviewsByProject(projectId: string): Promise<ReviewRow[]> {
    const rows = await this.prisma.review.findMany({ where: { projectId } });
    return rows.map(toReviewRow);
  }

  async getReview(reviewId: string): Promise<ReviewRow | undefined> {
    const row = await this.prisma.review.findUnique({ where: { id: reviewId } });
    return row ? toReviewRow(row) : undefined;
  }

  async getAllReviews(): Promise<ReviewRow[]> {
    const rows = await this.prisma.review.findMany();
    return rows.map(toReviewRow);
  }

  async insertReview(row: ReviewRow): Promise<void> {
    await this.prisma.review.create({
      data: {
        id: row.reviewId,
        projectId: row.projectId,
        contractId: row.contractId,
        reviewerId: row.reviewerId,
        revieweeId: row.revieweeId,
        direction: row.direction,
        rating: row.rating,
        comment: row.comment,
        tags: row.tags,
        createdAt: new Date(row.createdAt),
        reviewCreatedPublishedAt: row.reviewCreatedPublishedAt ? new Date(row.reviewCreatedPublishedAt) : null,
      },
    });
  }

  async markReviewCreatedPublished(reviewId: string, publishedAt: string): Promise<void> {
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { reviewCreatedPublishedAt: new Date(publishedAt) },
    });
  }

  async getIdempotency(key: string): Promise<{ bodyHash: string; reviewId: string } | undefined> {
    const row = await this.prisma.reviewIdempotencyKey.findUnique({ where: { key } });
    return row ? { bodyHash: row.bodyHash, reviewId: row.reviewId } : undefined;
  }

  async setIdempotency(key: string, bodyHash: string, reviewId: string): Promise<void> {
    await this.prisma.reviewIdempotencyKey.upsert({
      where: { key },
      create: { key, bodyHash, reviewId },
      update: { bodyHash, reviewId },
    });
  }

  async nextReviewId(): Promise<string> {
    return `rvw_${randomUUID().replace(/-/g, '')}`;
  }
}

function toReviewRow(row: ReviewRecord): ReviewRow {
  return {
    reviewId: row.id,
    projectId: row.projectId,
    contractId: row.contractId,
    reviewerId: row.reviewerId,
    revieweeId: row.revieweeId,
    direction: row.direction as ReviewRow['direction'],
    rating: row.rating,
    comment: row.comment,
    tags: row.tags as string[],
    createdAt: row.createdAt.toISOString(),
    reviewCreatedPublishedAt: row.reviewCreatedPublishedAt ? row.reviewCreatedPublishedAt.toISOString() : null,
  };
}
