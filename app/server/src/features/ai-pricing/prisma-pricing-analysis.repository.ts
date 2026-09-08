import { Prisma, type PrismaClient, type PricingAnalysis as PricingAnalysisModel } from '../../generated/prisma/client';
import type {
  MarkPricingAnalysisAppliedInput,
  PricingAnalysisRepository,
} from './pricing-analysis.repository';
import type {
  PricingAnalysisBreakdownItem,
  PricingAnalysisFailureCode,
  PricingAnalysisInputSnapshot,
  PricingAnalysisPublicFailure,
  PricingAnalysisRecommendation,
  PricingAnalysisRow,
} from './pricing-analysis.types';

/**
 * PricingAnalysisRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryPricingAnalysisRepository와
 * 동작을 최대한 동일하게 맞췄다. 인터페이스 자체가 이미 전 메서드 Promise 반환이라
 * (오민혁 원본 설계, DB 구현을 염두에 두고 만든 경계 — 파일 헤더 주석) 다른 5개 기능과
 * 달리 sync→async 전환이 필요 없었다.
 *
 * `reservePending`은 InMemory가 "멱등키 중복이면 기존 행을 반환"하는 동작을 CAS로 재현한다 —
 * `@@unique([requesterId, idempotencyKey], map: "uq_pricing_analyses_requester_idempotency")`
 * 위반(P2002)을 잡아 기존 행을 다시 조회해 돌려준다(engagement의 PrismaBookmarkRepository와
 * 같은 P2002 패턴).
 *
 * `markApprovedIfPending`/`markRejectedIfPending`/`markAppliedIfApproved`는 InMemory의
 * "찾아서 상태 확인 후 갱신" CAS를 `updateMany`의 `where` 절 자체에 상태 조건을 넣어
 * 재현한다 — update() 대신 updateMany()를 쓴 이유는 매치 실패 시 update()는 예외를
 * 던지지만 updateMany()는 `count: 0`을 돌려줘서 CAS 실패를 조용히 표현할 수 있어서다.
 *
 * `model`/`promptVersion`/`schemaVersion`은 도메인 타입(PricingAnalysisRow)에서 항상
 * non-null이지만(pricing-analysis.service.ts가 분석 생성 시점에 항상 채운다),
 * schema.prisma 컬럼 자체는 nullable이다(모든 분석에 결과가 있는 건 아니라는 원본 설계와
 * 같은 이유로 방어적으로 nullable을 유지) — 읽을 때 빈 문자열로 방어한다.
 */
export class PrismaPricingAnalysisRepository implements PricingAnalysisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(analysisId: string): Promise<PricingAnalysisRow | null> {
    const row = await this.prisma.pricingAnalysis.findUnique({ where: { id: analysisId } });
    return row ? toRow(row) : null;
  }

  async findByIdempotency(requesterId: string, idempotencyKey: string): Promise<PricingAnalysisRow | null> {
    const row = await this.prisma.pricingAnalysis.findUnique({
      where: { requesterId_idempotencyKey: { requesterId, idempotencyKey } },
    });
    return row ? toRow(row) : null;
  }

  async reservePending(
    row: PricingAnalysisRow,
  ): Promise<{ kind: 'inserted' } | { kind: 'existing'; row: PricingAnalysisRow }> {
    try {
      await this.prisma.pricingAnalysis.create({
        data: {
          id: row.analysisId,
          requesterId: row.requesterId,
          projectId: row.projectId,
          inputSnapshot: row.inputSnapshot as unknown as Prisma.InputJsonValue,
          recommendedAmount: row.result?.recommendedAmount ?? null,
          breakdown: row.result ? (row.result.breakdown as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          modelName: row.model,
          promptVersion: row.promptVersion,
          resultSchemaVersion: row.schemaVersion,
          failureCode: row.failureCode,
          failureSnapshot: row.failureSnapshot
            ? (row.failureSnapshot as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          failureHttpStatus: row.failureHttpStatus,
          idempotencyKey: row.idempotencyKey,
          requestFingerprint: row.requestFingerprint,
          inputFingerprintSchemaVersion: row.inputSchemaVersion,
          reviewStatus: row.reviewStatus,
          reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
          appliedAt: row.appliedAt ? new Date(row.appliedAt) : null,
          createdAt: new Date(row.createdAt),
        },
      });
      return { kind: 'inserted' };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.pricingAnalysis.findUnique({
          where: { requesterId_idempotencyKey: { requesterId: row.requesterId, idempotencyKey: row.idempotencyKey } },
        });
        if (existing) return { kind: 'existing', row: toRow(existing) };
      }
      throw error;
    }
  }

  async markApprovedIfPending(
    analysisId: string,
    result: PricingAnalysisRecommendation,
    reviewedAt: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.pricingAnalysis.updateMany({
      where: { id: analysisId, reviewStatus: 'PENDING' },
      data: {
        reviewStatus: 'APPROVED',
        recommendedAmount: result.recommendedAmount,
        breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
        failureCode: null,
        failureSnapshot: Prisma.DbNull,
        failureHttpStatus: null,
        reviewedAt: new Date(reviewedAt),
      },
    });
    return count > 0;
  }

  async markRejectedIfPending(
    analysisId: string,
    failureCode: PricingAnalysisFailureCode,
    failureSnapshot: PricingAnalysisPublicFailure,
    failureHttpStatus: 502 | 504,
    reviewedAt: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.pricingAnalysis.updateMany({
      where: { id: analysisId, reviewStatus: 'PENDING' },
      data: {
        reviewStatus: 'REJECTED',
        recommendedAmount: null,
        breakdown: Prisma.DbNull,
        failureCode,
        failureSnapshot: failureSnapshot as unknown as Prisma.InputJsonValue,
        failureHttpStatus,
        reviewedAt: new Date(reviewedAt),
      },
    });
    return count > 0;
  }

  async markAppliedIfApproved(input: MarkPricingAnalysisAppliedInput): Promise<boolean> {
    const { count } = await this.prisma.pricingAnalysis.updateMany({
      where: {
        id: input.analysisId,
        requesterId: input.requesterId,
        reviewStatus: 'APPROVED',
        projectId: null,
        appliedAt: null,
      },
      data: {
        projectId: input.projectId,
        appliedAt: new Date(input.appliedAt),
      },
    });
    return count > 0;
  }
}

function toRow(row: PricingAnalysisModel): PricingAnalysisRow {
  const result: PricingAnalysisRecommendation | null =
    row.recommendedAmount !== null && row.breakdown !== null
      ? {
          recommendedAmount: row.recommendedAmount,
          currency: 'KRW',
          breakdown: row.breakdown as unknown as PricingAnalysisBreakdownItem[],
        }
      : null;
  return {
    analysisId: row.id,
    requesterId: row.requesterId,
    inputSnapshot: row.inputSnapshot as unknown as PricingAnalysisInputSnapshot,
    requestFingerprint: row.requestFingerprint,
    inputSchemaVersion: row.inputFingerprintSchemaVersion,
    idempotencyKey: row.idempotencyKey,
    reviewStatus: row.reviewStatus,
    result,
    failureCode: row.failureCode as PricingAnalysisFailureCode | null,
    failureSnapshot: row.failureSnapshot as unknown as PricingAnalysisPublicFailure | null,
    failureHttpStatus: row.failureHttpStatus as 502 | 504 | null,
    model: row.modelName ?? '',
    promptVersion: row.promptVersion ?? '',
    schemaVersion: row.resultSchemaVersion ?? '',
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
  };
}
