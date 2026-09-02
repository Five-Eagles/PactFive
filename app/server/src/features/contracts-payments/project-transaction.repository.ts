/**
 * contracts-payments가 project-transaction 포트 호출 시도를 자체적으로 남기는 감사 기록.
 *
 * `ProjectTransactionPort`(project-transaction.port.ts)의 멱등 처리는 "포트를 구현하는 쪽"
 * (project-management)의 책임이다. 이 repository는 그것과 다르다 — "우리(contracts-payments)가
 * 언제 어떤 프로젝트에 어떤 전이를 요청했는지"를 호출자 쪽에서도 남겨, 오류 원인 추적과 나중에
 * `contracts`/`payments`/`agreements` 테이블이 Prisma 스키마에 생겼을 때 실제 DB 기록으로
 * 옮기기 쉽게 하려는 목적이다 (`docs/naming-convention.md` §6 — Repository는 DB 행위를 다룬다).
 */
export type ProjectTransactionOperation =
  | 'MARK_PAYMENT_PENDING'
  | 'START_TRANSACTION'
  | 'COMPLETE_TRANSACTION'
  | 'RESTORE_PRE_CONTRACT';

export type ProjectTransactionCallLogEntry = {
  projectId: string;
  operation: ProjectTransactionOperation;
  idempotencyKey: string;
  requestedAt: Date;
  succeeded: boolean;
  /** 실패한 경우 DomainContractError의 code. 성공이면 null. */
  errorCode: string | null;
};

export interface ProjectTransactionCallLogRepository {
  record(entry: ProjectTransactionCallLogEntry): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<ProjectTransactionCallLogEntry | null>;
}
