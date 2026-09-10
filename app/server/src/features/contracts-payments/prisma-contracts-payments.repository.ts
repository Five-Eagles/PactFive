import { createHash, randomUUID } from 'node:crypto';
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
 * 3. `PaymentRow.clientKey`는 여전히 schema에 저장 컬럼이 없다 — 애초에 저장 대상이
 *    아니다. `process.env.PG_CLIENT_KEY`(서버 시크릿이 아니다, public-api.service.ts 원본
 *    주석)라 읽을 때마다 다시 채운다.
 *
 *    **2026-09-09 CR-CP-002(조준영) 반영으로 해소** — `platformFeeRateBps`는 저장 컬럼이
 *    없어 `platformFeeAmount`/`paymentAmount`로 역산했었다. 고정 요율 하나만 쓰는 동안은
 *    우연히 정확했지만(버림 오차가 반올림에 덮인다), 요율이 결제마다 달라지면 조용히
 *    틀렸을 것이다. `payments.platform_fee_rate_bps`(+`fee_policy_version`·`pg_cost_amount`)
 *    컬럼을 추가해 `toPaymentRow`가 이제 저장된 값을 그대로 읽는다 — 역산 없음.
 *    `feePolicyVersion`·`pgCostAmount`는 스키마 기본값(`fee-policy-v1`·`0`)만 쓴다 — 이
 *    값을 실제로 바꿔 쓰는 흐름(정책 버전 교체·PG 비용 기록)은 아직 `app/`에 없어
 *    도메인 `PaymentRow`에도 아직 없다(CR-CP-002 영향 범위 밖 — 그 흐름이 생기면 이
 *    파일과 `PaymentRow`를 함께 넓힌다).
 *
 * `getIdempotent`/`setIdempotent`는 negotiation·서명·납품·취소 등 서로 다른 응답 모양을 담는
 * 범용 캐시다. `PaymentIdempotencyRecord`는 bodyHash(64자)만 있어 전체 응답 JSON을 담지
 * 못하므로, 프로세스 공유 Map에 값을 두고 DB에는 키·scope·해시 마커만 upsert한다
 * (T13: repository 인스턴스 재생성 후에도 동일 프로세스 내 조회 유지). 프로세스 재시작
 * 후 값 복원은 payload 컬럼 추가가 필요하다.
 */
/** 인스턴스 간 공유 — Prisma 재생성(T13)에서도 같은 프로세스면 유지. */
const sharedIdempotency = new Map<string, unknown>();

export class PrismaContractsPaymentsRepository implements ContractsPaymentsRepository {
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
    // offers는 항상 "다음 상태의 전체 배열"을 받는다 — 전량 삭제 후 재삽입.
    // C-02 — 기존 offerId를 유지한다(nof_ 신규 UUID로 바꾸면 클라이언트의 offerId가 깨진다).
    await this.prisma.negotiationOffer.deleteMany({ where: { applicationId: row.applicationId } });
    if (row.offers.length > 0) {
      await this.prisma.negotiationOffer.createMany({
        data: row.offers.map((offer) => ({
          id: offer.offerId,
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
        // CR-CP-002 — 결제 생성 시점의 요율 스냅샷. feePolicyVersion·pgCostAmount는 아직
        // 도메인 PaymentRow에 없어(파일 헤더 주석 3번) 스키마 기본값을 그대로 쓴다.
        platformFeeRateBps: row.platformFeeRateBps,
        status: row.status,
        pgOrderId: row.orderId,
        pgPaymentKey: row.paymentKey,
        failedAt: row.failedAt ? new Date(row.failedAt) : null,
        failureCode: row.failureCode,
        releasedAt: row.releasedAt ? new Date(row.releasedAt) : null,
      },
      update: {
        status: row.status,
        pgOrderId: row.orderId,
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
        fileSha256: row.fileSha256,
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
        fileSha256: row.fileSha256,
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
    const id = `${namespace}:${key}`;
    const cached = sharedIdempotency.get(id);
    if (cached !== undefined) return cached as T;
    // DB 마커만 있어도 값은 없으므로 undefined — 재시작 복구는 payload 컬럼 필요.
    try {
      const row = await this.prisma.paymentIdempotencyRecord.findUnique({
        where: { idempotencyKey: id },
      });
      if (!row) return undefined;
    } catch {
      // fake prisma(T13) 등에서는 Map만 사용.
    }
    return undefined;
  }

  async setIdempotent<T>(namespace: string, key: string, value: T): Promise<void> {
    const id = `${namespace}:${key}`;
    sharedIdempotency.set(id, value);
    const payload = JSON.stringify(value);
    const bodyHash =
      payload.length <= 64
        ? payload
        : // sha256 hex 64자 — 마커용. 값 자체는 shared Map에만 있다.
          createHash('sha256').update(payload).digest('hex');
    try {
      await this.prisma.paymentIdempotencyRecord.upsert({
        where: { idempotencyKey: id },
        create: { idempotencyKey: id, scope: namespace.slice(0, 40), bodyHash },
        update: { scope: namespace.slice(0, 40), bodyHash },
      });
    } catch {
      // fake prisma 또는 미마이그레이션 — Map만으로도 T13·동일 프로세스 멱등은 유지.
    }
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
  return {
    paymentId: row.id,
    contractId: row.contractId,
    orderId: row.pgOrderId,
    amount: row.paymentAmount,
    // CR-CP-002 — 저장된 스냅샷을 그대로 읽는다. 이전엔 저장 컬럼이 없어 platformFeeAmount÷
    // paymentAmount로 역산했다(파일 헤더 주석 3번 — 고정 요율 하나만 쓰는 동안은 우연히
    // 정확했다).
    platformFeeRateBps: row.platformFeeRateBps,
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
    fileSha256: row.fileSha256,
  };
}

function toInvalidationRow(row: InvalidationModel): InvalidationRow {
  return {
    cancellationId: row.cancellationId,
    projectId: row.projectId,
    contractInvalidation: row.contractInvalidation as InvalidationRow['contractInvalidation'],
  };
}
