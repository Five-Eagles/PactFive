import type { AgreementStatus, ContractStatus } from './contract.types';
import type { DeliveryPaymentStatus, DeliveryStatus, PostActionResult } from './public-api.types';

/**
 * agreements · negotiation_offer · contracts · payments · deliveries 인메모리 저장소.
 *
 * `app/server/prisma/schema.prisma`가 비어 있는 동안(팀장 전담 영역, docs/domain/erd.md
 * "조준영 담당" 4개 엔티티가 아직 테이블로 없다) 이 저장소가 그 자리를 대신한다. 컬럼 이름은
 * ERD(`agreements`·`negotiation_offer`·`contracts`·`payments`)의 의미를 그대로 따르되
 * camelCase로 옮겼다 — Prisma 스키마가 생기면 이 Map을 실제 테이블 접근으로 교체한다
 * (project-management의 InMemoryProjectRepository와 같은 자리).
 *
 * 원본: features/contracts-payments/prototype/mock/public-api.mock.ts (28471d6, #80)의 저장
 * 로직을 "실제 서비스가 쓰는 저장소" 형태로 재구성했다 — Mock은 테스트용 시드값을 갖지만 이
 * 저장소는 갖지 않는다. 2026-09-07 팀장 반영에서 delivery·invalidation 테이블을 추가했다
 * (spec.md 규칙 23·25, ERD 제안: fileObjectKey·fileSha256·version·requestedBy).
 *
 * 2026-09-08 팀장 반영: 6기능 Prisma 이식 트랙 — Prisma 백엔드 추가를 위해 전 메서드를
 * Promise 반환으로 바꿨다. InMemory 구현은 계산한 값을 Promise.resolve로 감싸기만 하면 되고,
 * public-api.service.ts 호출부는 await를 추가한다(project-management의 같은 전환과 동일 패턴).
 * `getIdempotent`/`setIdempotent`는 Prisma 구현에서도 여러 namespace의 서로 다른 응답 모양을
 * 담는 범용 캐시라 스키마에 대응하는 테이블이 없다 — PrismaContractsPaymentsRepository 헤더
 * 주석에 알려진 gap으로 남겨둔다(ai-pricing의 ProjectBudgetApplicationAdapter와 같은 성격).
 */

export type NegotiationOfferRow = {
  offerId: string;
  round: number;
  amount: number;
  offeredByUserId: string;
  rejectedReason: string | null;
};

export type AgreementRow = {
  agreementId: string;
  projectId: string;
  applicationId: string;
  proposedByUserId: string;
  status: AgreementStatus;
  agreedAmount: number;
  respondedAt: string | null;
  offers: NegotiationOfferRow[];
};

export type ContractRow = {
  contractId: string;
  agreementId: string;
  projectId: string;
  clientId: string;
  freelancerId: string;
  agreedAmount: number;
  projectTitleSnapshot: string;
  workStartDate: string;
  workEndDate: string;
  termsSnapshot: { schemaVersion: 1; amount: number; currency: 'KRW'; projectTitle: string };
  status: ContractStatus;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
};

export type SignatureAuditRow = {
  contractId: string;
  signerId: string;
  signedAt: string;
};

export type PaymentRow = {
  paymentId: string;
  contractId: string;
  orderId: string;
  amount: number;
  platformFeeRateBps: number;
  platformFeeAmount: number;
  settlementAmount: number;
  status: DeliveryPaymentStatus;
  clientKey: string;
  paymentKey: string | null;
  failedAt: string | null;
  failureCode: string | null;
  releasedAt: string | null;
};

export type DeliveryRow = {
  deliveryId: string;
  contractId: string;
  status: DeliveryStatus;
  version: number;
  message: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  objectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

/** GET cancellation의 "마지막 무효화 결과" 조립용(spec.md 규칙 25). */
export type InvalidationRow = {
  cancellationId: string;
  projectId: string;
  contractInvalidation: PostActionResult;
};

export interface ContractsPaymentsRepository {
  findAgreementByProjectId(projectId: string): Promise<AgreementRow | undefined>;
  findAgreementById(agreementId: string): Promise<AgreementRow | undefined>;
  saveAgreement(row: AgreementRow): Promise<void>;

  findContractById(contractId: string): Promise<ContractRow | undefined>;
  findContractByProjectId(projectId: string): Promise<ContractRow | undefined>;
  saveContract(row: ContractRow): Promise<void>;
  recordSignature(row: SignatureAuditRow): Promise<void>;
  hasSignatureAudit(contractId: string): Promise<boolean>;

  findPaymentById(paymentId: string): Promise<PaymentRow | undefined>;
  findPaymentByContractId(contractId: string): Promise<PaymentRow | undefined>;
  findPaymentByOrderId(orderId: string): Promise<PaymentRow | undefined>;
  savePayment(row: PaymentRow): Promise<void>;

  findDeliveryByContractId(contractId: string): Promise<DeliveryRow | undefined>;
  saveDelivery(row: DeliveryRow): Promise<void>;

  findLatestInvalidationByProjectId(projectId: string): Promise<InvalidationRow | undefined>;
  saveInvalidation(row: InvalidationRow): Promise<void>;

  /** 멱등 캐시 — 같은 키로 다시 호출하면 이전 응답을 그대로 준다. */
  getIdempotent<T>(namespace: string, key: string): Promise<T | undefined>;
  setIdempotent<T>(namespace: string, key: string, value: T): Promise<void>;
}

export class InMemoryContractsPaymentsRepository implements ContractsPaymentsRepository {
  private readonly agreements = new Map<string, AgreementRow>();
  private readonly contracts = new Map<string, ContractRow>();
  private readonly payments = new Map<string, PaymentRow>();
  private readonly deliveries = new Map<string, DeliveryRow>();
  private readonly invalidationsByProject = new Map<string, InvalidationRow>();
  private readonly audits: SignatureAuditRow[] = [];
  private readonly idempotency = new Map<string, unknown>();

  async findAgreementByProjectId(projectId: string): Promise<AgreementRow | undefined> {
    return [...this.agreements.values()].find((row) => row.projectId === projectId);
  }

  async findAgreementById(agreementId: string): Promise<AgreementRow | undefined> {
    return this.agreements.get(agreementId);
  }

  async saveAgreement(row: AgreementRow): Promise<void> {
    this.agreements.set(row.agreementId, row);
  }

  async findContractById(contractId: string): Promise<ContractRow | undefined> {
    return this.contracts.get(contractId);
  }

  async findContractByProjectId(projectId: string): Promise<ContractRow | undefined> {
    return [...this.contracts.values()].find((row) => row.projectId === projectId);
  }

  async saveContract(row: ContractRow): Promise<void> {
    this.contracts.set(row.contractId, row);
  }

  async recordSignature(row: SignatureAuditRow): Promise<void> {
    this.audits.push(row);
  }

  async hasSignatureAudit(contractId: string): Promise<boolean> {
    return this.audits.some((row) => row.contractId === contractId);
  }

  async findPaymentById(paymentId: string): Promise<PaymentRow | undefined> {
    return this.payments.get(paymentId);
  }

  async findPaymentByContractId(contractId: string): Promise<PaymentRow | undefined> {
    return [...this.payments.values()].find((row) => row.contractId === contractId);
  }

  async findPaymentByOrderId(orderId: string): Promise<PaymentRow | undefined> {
    return [...this.payments.values()].find((row) => row.orderId === orderId);
  }

  async savePayment(row: PaymentRow): Promise<void> {
    this.payments.set(row.paymentId, row);
  }

  async findDeliveryByContractId(contractId: string): Promise<DeliveryRow | undefined> {
    return this.deliveries.get(contractId);
  }

  async saveDelivery(row: DeliveryRow): Promise<void> {
    this.deliveries.set(row.contractId, row);
  }

  async findLatestInvalidationByProjectId(projectId: string): Promise<InvalidationRow | undefined> {
    return this.invalidationsByProject.get(projectId);
  }

  async saveInvalidation(row: InvalidationRow): Promise<void> {
    this.invalidationsByProject.set(row.projectId, row);
  }

  async getIdempotent<T>(namespace: string, key: string): Promise<T | undefined> {
    return this.idempotency.get(`${namespace}:${key}`) as T | undefined;
  }

  async setIdempotent<T>(namespace: string, key: string, value: T): Promise<void> {
    this.idempotency.set(`${namespace}:${key}`, value);
  }
}
