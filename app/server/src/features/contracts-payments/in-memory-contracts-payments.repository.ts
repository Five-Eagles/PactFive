import type { AgreementStatus, ContractStatus } from './contract.types';
import type { PaymentRecordStatus } from './public-api.types';

/**
 * agreements · negotiation_offer · contracts · payments 인메모리 저장소.
 *
 * `app/server/prisma/schema.prisma`가 비어 있는 동안(팀장 전담 영역, docs/domain/erd.md
 * "조준영 담당" 4개 엔티티가 아직 테이블로 없다) 이 저장소가 그 자리를 대신한다. 컬럼 이름은
 * ERD(`agreements`·`negotiation_offer`·`contracts`·`payments`)의 의미를 그대로 따르되
 * camelCase로 옮겼다 — Prisma 스키마가 생기면 이 Map을 실제 테이블 접근으로 교체한다
 * (project-management의 InMemoryProjectRepository와 같은 자리).
 *
 * 원본: features/contracts-payments/prototype/mock/public-api.mock.ts (67207c8)의 저장 로직을
 * "실제 서비스가 쓰는 저장소" 형태로 재구성했다 — Mock은 테스트용 시드값을 갖지만 이 저장소는
 * 갖지 않는다.
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
  platformFeeAmount: number;
  settlementAmount: number;
  status: PaymentRecordStatus;
  clientKey: string;
  paymentKey: string | null;
  failedAt: string | null;
  failureCode: string | null;
};

export interface ContractsPaymentsRepository {
  findAgreementByProjectId(projectId: string): AgreementRow | undefined;
  findAgreementById(agreementId: string): AgreementRow | undefined;
  saveAgreement(row: AgreementRow): void;

  findContractById(contractId: string): ContractRow | undefined;
  findContractByProjectId(projectId: string): ContractRow | undefined;
  saveContract(row: ContractRow): void;
  recordSignature(row: SignatureAuditRow): void;

  findPaymentById(paymentId: string): PaymentRow | undefined;
  findPaymentByContractId(contractId: string): PaymentRow | undefined;
  findPaymentByOrderId(orderId: string): PaymentRow | undefined;
  savePayment(row: PaymentRow): void;

  /** 멱등 캐시 — 같은 키로 다시 호출하면 이전 응답을 그대로 준다. */
  getIdempotent<T>(namespace: string, key: string): T | undefined;
  setIdempotent<T>(namespace: string, key: string, value: T): void;
}

export class InMemoryContractsPaymentsRepository implements ContractsPaymentsRepository {
  private readonly agreements = new Map<string, AgreementRow>();
  private readonly contracts = new Map<string, ContractRow>();
  private readonly payments = new Map<string, PaymentRow>();
  private readonly audits: SignatureAuditRow[] = [];
  private readonly idempotency = new Map<string, unknown>();

  findAgreementByProjectId(projectId: string): AgreementRow | undefined {
    return [...this.agreements.values()].find((row) => row.projectId === projectId);
  }

  findAgreementById(agreementId: string): AgreementRow | undefined {
    return this.agreements.get(agreementId);
  }

  saveAgreement(row: AgreementRow): void {
    this.agreements.set(row.agreementId, row);
  }

  findContractById(contractId: string): ContractRow | undefined {
    return this.contracts.get(contractId);
  }

  findContractByProjectId(projectId: string): ContractRow | undefined {
    return [...this.contracts.values()].find((row) => row.projectId === projectId);
  }

  saveContract(row: ContractRow): void {
    this.contracts.set(row.contractId, row);
  }

  recordSignature(row: SignatureAuditRow): void {
    this.audits.push(row);
  }

  findPaymentById(paymentId: string): PaymentRow | undefined {
    return this.payments.get(paymentId);
  }

  findPaymentByContractId(contractId: string): PaymentRow | undefined {
    return [...this.payments.values()].find((row) => row.contractId === contractId);
  }

  findPaymentByOrderId(orderId: string): PaymentRow | undefined {
    return [...this.payments.values()].find((row) => row.orderId === orderId);
  }

  savePayment(row: PaymentRow): void {
    this.payments.set(row.paymentId, row);
  }

  getIdempotent<T>(namespace: string, key: string): T | undefined {
    return this.idempotency.get(`${namespace}:${key}`) as T | undefined;
  }

  setIdempotent<T>(namespace: string, key: string, value: T): void {
    this.idempotency.set(`${namespace}:${key}`, value);
  }
}
