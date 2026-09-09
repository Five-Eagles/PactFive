import { randomUUID } from 'node:crypto';
import type {
  Prisma,
  PrismaClient,
  Agreement as AgreementModel,
  Contract as ContractModel,
  Payment as PaymentModel,
  Delivery as DeliveryModel,
  Invalidation as InvalidationModel,
} from '../../generated/prisma/client';
import type {
  AgreementRow,
  ContractRow,
  ContractsPaymentsRepository,
  DeliveryRow,
  InvalidationRow,
  NegotiationOfferRow,
  PaymentRow,
  SignatureAuditRow,
} from './in-memory-contracts-payments.repository';

/**
 * ContractsPaymentsRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryContractsPaymentsRepository와 동작을
 * 최대한 동일하게 맞췄다. 도메인 타입(in-memory-contracts-payments.repository.ts)과
 * schema.prisma 사이에 3가지 메꿔야 할 간극이 있었다 — 전부 스키마를 다시 건드리지 않고
 * 이 파일 안에서 흡수했다(schema.prisma는 이번 6기능 트랙의 스코프 밖):
 *
 * 1. `AgreementRow.offers`(중첩 배열) ↔ `NegotiationOffer`(자식 테이블, applicationId로 연결).
 *    project-management의 projectSkills·applications의 operation steps와 같은 전량 삭제 후
 *    재삽입 패턴 — `saveAgreement`가 항상 "다음 상태의 전체 offers 배열"을 받는다
 *    (public-api.service.ts가 매번 배열 전체를 다시 만들어 넘긴다).
 * 2. `Payment.clientId`/`freelancerId`는 schema에서 NOT NULL이지만 도메인 `PaymentRow`는
 *    이 두 필드를 갖지 않는다(계약에 이미 있는 정보라 중복을 안 옮긴 것으로 보인다) —
 *    `savePayment`가 최초 삽입 시 `contractId`로 Contract를 찾아 채운다.
 * 3. `PaymentRow.clientKey`/`platformFeeRateBps`는 schema에 저장 컬럼이 없다.
 *    `clientKey`는 애초에 저장 대상이 아니다 — `process.env.PG_CLIENT_KEY`(서버 시크릿이
 *    아니다, public-api.service.ts 원본 주석)라 읽을 때마다 다시 채운다.
 *    `platformFeeRateBps`는 실제로는 결제 생성 시점의 스냅샷이어야 하지만(settlement-fee.ts
 *    주석 — "과거 결제는 요율이 바뀌어도 다시 나누지 않는다") 저장 컬럼이 없어
 *    `platformFeeAmount`/`paymentAmount`로 역산한다. 지금은 시스템 전체가 고정 요율
 *    하나만 쓰므로(public-api.service.ts `platformFeeRate = 0.1` 기본값) 정확히 일치하지만,
 *    요율이 실제로 결제마다 달라지는 기능이 생기면 이 역산은 부정확해진다 — 알려진 gap으로
 *    남긴다(조준영 확인 필요, feedback_loop 참고).
 *
 * `getIdempotent`/`setIdempotent`는 negotiation·서명·납품·취소 등 서로 다른 응답 모양을 담는
 * 범용 캐시라 대응하는 Prisma 모델이 없다 — ai-pricing의 ProjectBudgetApplicationAdapter와
 * 같은 성격의 known gap으로, 이 클래스 안에 in-memory Map으로만 남겨둔다(재시작하면 멱등
 * 캐시가 비어 재처리될 수 있다 — 결과 자체는 CAS/유니크 제약으로 여전히 안전하다).
 */
export class PrismaContractsPaymentsRepository implements ContractsPaymentsRepository {
  private readonly idempotency = new Map<string, unknown>();

  constructor(private readonly prisma: PrismaClient) {}

  async findAgreementByProjectId(projectId: string): Promise<AgreementRow | undefined> {
    const row = await this.prisma.agreement.findFirst({ where: { application: { projectId } } });
    if (!row) return undefined;
    return this.toAgreementRow(row, projectId);
  }

  async findAgreementById(agreementId: string): Promise<AgreementRow | undefined> {
    const row = await this.prisma.agreement.findUnique({ where: { id: agreementId } });
    if (!row) return undefined;
    const application = await this.prisma.application.findUnique({ where: { id: row.applicationId } });
    return this.toAgreementRow(row, application?.projectId ?? '');
  }

  async saveAgreement(row: AgreementRow): Promise<void> {
    await this.prisma.agreement.upsert({
      where: { id: row.agreementId },
      create: {
        id: row.agreementId,
        applicationId: row.applicationId,
        proposedByUserId: row.proposedByUserId,
        agreedAmount: row.agreedAmount,
        status: row.status,
        respondedAt: row.respondedAt ? new Date(row.respondedAt) : null,
      },
      update: {
        proposedByUserId: row.proposedByUserId,
        agreedAmount: row.agreedAmount,
        status: row.status,
        respondedAt: row.respondedAt ? new Date(row.respondedAt) : null,
      },
    });
    // offers는 항상 "다음 상태의 전체 배열"을 받는다(파일 헤더 주석 1번) — 전량 삭제 후 재삽입.
    await this.prisma.negotiationOffer.deleteMany({ where: { applicationId: row.applicationId } });
    if (row.offers.length > 0) {
      await this.prisma.negotiationOffer.createMany({
        data: row.offers.map((offer) => ({
          id: `nof_${randomUUID().replace(/-/g, '')}`,
          applicationId: row.applicationId,
          round: offer.round,
          proposedByUserId: offer.offeredByUserId,
          offeredAmount: offer.amount,
          rejectedReason: offer.rejectedReason,
        })),
      });
    }
  }

  async findContractById(contractId: string): Promise<ContractRow | undefined> {
    const row = await this.prisma.contract.findUnique({ where: { id: contractId } });
    return row ? toContractRow(row) : undefined;
  }

  async findContractByProjectId(projectId: string): Promise<ContractRow | undefined> {
    const row = await this.prisma.contract.findFirst({ where: { projectId } });
    return row ? toContractRow(row) : undefined;
  }

  async saveContract(row: ContractRow): Promise<void> {
    await this.prisma.contract.upsert({
      where: { id: row.contractId },
      create: {
        id: row.contractId,
        agreementId: row.agreementId,
        projectId: row.projectId,
        clientId: row.clientId,
        freelancerId: row.freelancerId,
        projectTitleSnapshot: row.projectTitleSnapshot,
        agreedAmount: row.agreedAmount,
        workStartDate: new Date(row.workStartDate),
        workEndDate: new Date(row.workEndDate),
        termsSnapshot: row.termsSnapshot as unknown as Prisma.InputJsonValue,
        status: row.status,
        clientSignedAt: row.clientSignedAt ? new Date(row.clientSignedAt) : null,
        freelancerSignedAt: row.freelancerSignedAt ? new Date(row.freelancerSignedAt) : null,
        signedAt: row.signedAt ? new Date(row.signedAt) : null,
      },
      update: {
        status: row.status,
        clientSignedAt: row.clientSignedAt ? new Date(row.clientSignedAt) : null,
        freelancerSignedAt: row.freelancerSignedAt ? new Date(row.freelancerSignedAt) : null,
        signedAt: row.signedAt ? new Date(row.signedAt) : null,
      },
    });
  }

  async recordSignature(row: SignatureAuditRow): Promise<void> {
    const contract = await this.prisma.contract.findUnique({ where: { id: row.contractId } });
    const signerRole = contract && row.signerId === contract.freelancerId ? 'FREELANCER' : 'CLIENT';
    await this.prisma.contractSignatureAudit.create({
      data: {
        id: `csa_${randomUUID().replace(/-/g, '')}`,
        contractId: row.contractId,
        signerId: row.signerId,
        signerRole,
        signedAt: new Date(row.signedAt),
      },
    });
  }

  async hasSignatureAudit(contractId: string): Promise<boolean> {
    const count = await this.prisma.contractSignatureAudit.count({ where: { contractId } });
    return count > 0;
  }

  async findPaymentById(paymentId: string): Promise<PaymentRow | undefined> {
    const row = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    return row ? toPaymentRow(row) : undefined;
  }

  async findPaymentByContractId(contractId: string): Promise<PaymentRow | undefined> {
    const row = await this.prisma.payment.findUnique({ where: { contractId } });
    return row ? toPaymentRow(row) : undefined;
  }

  async findPaymentByOrderId(orderId: string): Promise<PaymentRow | undefined> {
    const row = await this.prisma.payment.findUnique({ where: { pgOrderId: orderId } });
    return row ? toPaymentRow(row) : undefined;
  }

  async savePayment(row: PaymentRow): Promise<void> {
    const existing = await this.prisma.payment.findUnique({ where: { id: row.paymentId } });
    let clientId: string;
    let freelancerId: string;
    if (existing) {
      clientId = existing.clientId;
      freelancerId = existing.freelancerId;
    } else {
      // 파일 헤더 주석 2번 — Payment.clientId/freelancerId는 NOT NULL이지만 PaymentRow엔 없다.
      const contract = await this.prisma.contract.findUniqueOrThrow({ where: { id: row.contractId } });
      clientId = contract.clientId;
      freelancerId = contract.freelancerId;
    }
    await this.prisma.payment.upsert({
      where: { id: row.paymentId },
      create: {
        id: row.paymentId,
        contractId: row.contractId,
        clientId,
        freelancerId,
        paymentAmount: row.amount,
        platformFeeAmount: row.platformFeeAmount,
        settlementAmount: row.settlementAmount,
        status: row.status,
        pgOrderId: row.orderId,
        pgPaymentKey: row.paymentKey,
        failedAt: row.failedAt ? new Date(row.failedAt) : null,
        failureCode: row.failureCode,
        releasedAt: row.releasedAt ? new Date(row.releasedAt) : null,
      },
      update: {
        status: row.status,
        pgPaymentKey: row.paymentKey,
        failedAt: row.failedAt ? new Date(row.failedAt) : null,
        failureCode: row.failureCode,
        releasedAt: row.releasedAt ? new Date(row.releasedAt) : null,
      },
    });
  }

  async findDeliveryByContractId(contractId: string): Promise<DeliveryRow | undefined> {
    const row = await this.prisma.delivery.findUnique({ where: { contractId } });
    return row ? toDeliveryRow(row) : undefined;
  }

  async saveDelivery(row: DeliveryRow): Promise<void> {
    await this.prisma.delivery.upsert({
      where: { contractId: row.contractId },
      create: {
        id: row.deliveryId,
        contractId: row.contractId,
        status: row.status,
        version: row.version,
        message: row.message,
        requestedAt: row.requestedAt ? new Date(row.requestedAt) : null,
        approvedAt: row.approvedAt ? new Date(row.approvedAt) : null,
        objectKey: row.objectKey,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
      },
      update: {
        status: row.status,
        version: row.version,
        message: row.message,
        requestedAt: row.requestedAt ? new Date(row.requestedAt) : null,
        approvedAt: row.approvedAt ? new Date(row.approvedAt) : null,
        objectKey: row.objectKey,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
      },
    });
  }

  async findLatestInvalidationByProjectId(projectId: string): Promise<InvalidationRow | undefined> {
    // schema의 ix_invalidations_latest_by_project 인덱스([projectId, createdAt])를 그대로 쓴다.
    const row = await this.prisma.invalidation.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toInvalidationRow(row) : undefined;
  }

  async saveInvalidation(row: InvalidationRow): Promise<void> {
    await this.prisma.invalidation.upsert({
      where: { cancellationId: row.cancellationId },
      create: {
        cancellationId: row.cancellationId,
        projectId: row.projectId,
        contractInvalidation: row.contractInvalidation,
      },
      update: {
        contractInvalidation: row.contractInvalidation,
      },
    });
  }

  async getIdempotent<T>(namespace: string, key: string): Promise<T | undefined> {
    return this.idempotency.get(`${namespace}:${key}`) as T | undefined;
  }

  async setIdempotent<T>(namespace: string, key: string, value: T): Promise<void> {
    this.idempotency.set(`${namespace}:${key}`, value);
  }

  private async toAgreementRow(row: AgreementModel, projectId: string): Promise<AgreementRow> {
    const offers = await this.prisma.negotiationOffer.findMany({
      where: { applicationId: row.applicationId },
      orderBy: { round: 'asc' },
    });
    return {
      agreementId: row.id,
      projectId,
      applicationId: row.applicationId,
      proposedByUserId: row.proposedByUserId,
      status: row.status,
      agreedAmount: row.agreedAmount,
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      offers: offers.map(
        (offer): NegotiationOfferRow => ({
          offerId: offer.id,
          round: offer.round,
          amount: offer.offeredAmount,
          offeredByUserId: offer.proposedByUserId,
          rejectedReason: offer.rejectedReason,
        }),
      ),
    };
  }
}

function toContractRow(row: ContractModel): ContractRow {
  return {
    contractId: row.id,
    agreementId: row.agreementId,
    projectId: row.projectId,
    clientId: row.clientId,
    freelancerId: row.freelancerId,
    agreedAmount: row.agreedAmount,
    projectTitleSnapshot: row.projectTitleSnapshot,
    workStartDate: row.workStartDate.toISOString().slice(0, 10),
    workEndDate: row.workEndDate.toISOString().slice(0, 10),
    termsSnapshot: row.termsSnapshot as unknown as ContractRow['termsSnapshot'],
    status: row.status,
    clientSignedAt: row.clientSignedAt ? row.clientSignedAt.toISOString() : null,
    freelancerSignedAt: row.freelancerSignedAt ? row.freelancerSignedAt.toISOString() : null,
    signedAt: row.signedAt ? row.signedAt.toISOString() : null,
  };
}

function toPaymentRow(row: PaymentModel): PaymentRow {
  // 파일 헤더 주석 3번 — platformFeeRateBps는 저장 컬럼이 없어 역산한다.
  const platformFeeRateBps =
    row.paymentAmount > 0 ? Math.round((row.platformFeeAmount / row.paymentAmount) * 10_000) : 0;
  return {
    paymentId: row.id,
    contractId: row.contractId,
    orderId: row.pgOrderId,
    amount: row.paymentAmount,
    platformFeeRateBps,
    platformFeeAmount: row.platformFeeAmount,
    settlementAmount: row.settlementAmount,
    status: row.status === 'REFUNDED' ? 'FAILED' : row.status,
    // 서버 시크릿이 아니다(public-api.service.ts 원본 주석) — 저장하지 않고 매번 다시 채운다.
    clientKey: process.env.PG_CLIENT_KEY ?? '',
    paymentKey: row.pgPaymentKey,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
    failureCode: row.failureCode,
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
  };
}

function toDeliveryRow(row: DeliveryModel): DeliveryRow {
  return {
    deliveryId: row.id,
    contractId: row.contractId,
    status: row.status,
    version: row.version,
    message: row.message,
    requestedAt: row.requestedAt ? row.requestedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    objectKey: row.objectKey,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}

function toInvalidationRow(row: InvalidationModel): InvalidationRow {
  return {
    cancellationId: row.cancellationId,
    projectId: row.projectId,
    contractInvalidation: row.contractInvalidation as InvalidationRow['contractInvalidation'],
  };
}
