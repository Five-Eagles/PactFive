import type { ProjectTransactionPort } from './project-transaction.port';
import {
  DomainContractError,
  type CompleteProjectTransactionInput,
  type CompleteProjectTransactionResponse,
  type MarkPaymentPendingInput,
  type MarkPaymentPendingResponse,
  type ProjectNegotiationContextResponse,
  type ProjectTransactionStatus,
  type RecruitmentStatus,
  type RestorePreContractProjectInput,
  type RestorePreContractProjectResponse,
  type StartProjectTransactionInput,
  type StartProjectTransactionResponse,
} from './project-transaction.types';

/**
 * `ProjectTransactionPort` 의 실제 구현 연결 — project-management 로 넘긴다.
 *
 * ## 무엇이 바뀌었나 (2026-08-28)
 *
 * 2026-08-27 통합에서는 `in-memory-project-transaction.adapter.ts` 가
 * project-management 서버 역할을 흉내 냈고, `/internal/v1/projects/...` 라우트도
 * contracts-payments 폴더가 서빙했다. project-management 가 통합되면서 원래 설계대로
 * (api-contract.md — "유동우가 구현, 조준영이 호출") 소유권을 그쪽으로 되돌렸고,
 * 이 폴더는 **순수 호출자**가 됐다. 그 인메모리 대행 파일과 controller·routes 는 삭제했다.
 *
 * ## 왜 HTTP 로 부르지 않나
 *
 * 두 기능이 같은 Express 앱 안에 있다. 자기 자신에게 HTTP 왕복을 돌면 서버리스 실행 시간만
 * 쓰고 얻는 게 없다. 대신 조립 지점(`app/server/src/app.ts`)이 project-management 의 계약
 * 서비스를 `delegate` 로 넣어 준다.
 *
 * **project-management 폴더를 import 하지 않는다.** `delegate` 의 모양을 여기서 구조적으로
 * 선언해 두고 app.ts 가 실제 구현을 끼운다 — 기능 폴더 간 직접 import 금지(app/web/AGENTS.md
 * "폴더 간 접점"과 같은 원칙). 두 도메인이 다른 서버로 갈라지면 이 파일만 HTTP 클라이언트로
 * 바꾼다 (ADR-0009).
 */

/** project-management 쪽 응답의 폭이 더 넓다 — 여기서 이 도메인의 좁은 타입으로 좁힌다 */
type DelegateResult = {
  alreadyProcessed: boolean;
  processedAt: string;
  changed: boolean;
  projectVersion: number;
};

export type ProjectTransactionDelegate = {
  getProjectNegotiationContext(projectId: string): Promise<{
    projectId: string;
    clientId: string;
    recruitmentStatus: RecruitmentStatus;
    transactionStatus: ProjectTransactionStatus;
    acceptedApplicationId: string | null;
    recruitmentDeadlineAt: string;
    canceledAt: string | null;
    paymentPendingAt: string | null;
    projectVersion: number;
  }>;
  markPaymentPending(
    projectId: string,
    input: {
      requestId: string;
      idempotencyKey: string;
      occurredAt: string;
      expectedProjectVersion?: number;
      contractId: string;
    },
  ): Promise<DelegateResult & { projectId: string; transactionStatus: ProjectTransactionStatus; paymentPendingAt: string }>;
  startProjectTransaction(
    projectId: string,
    input: {
      requestId: string;
      idempotencyKey: string;
      occurredAt: string;
      expectedProjectVersion: number;
      contractId: string;
    },
  ): Promise<DelegateResult & { projectId: string; recruitmentStatus: RecruitmentStatus; transactionStatus: ProjectTransactionStatus }>;
  completeProjectTransaction(
    projectId: string,
    input: {
      requestId: string;
      idempotencyKey: string;
      occurredAt: string;
      expectedProjectVersion: number;
      contractId: string;
    },
  ): Promise<DelegateResult & { projectId: string; recruitmentStatus: RecruitmentStatus; transactionStatus: ProjectTransactionStatus }>;
  restorePreContractProject(
    projectId: string,
    input: {
      requestId: string;
      idempotencyKey: string;
      occurredAt: string;
      expectedProjectVersion?: number;
      negotiationId: string;
      offerId?: string;
      actorUserId?: string;
      reason: 'FREELANCER_REJECTED' | 'CLIENT_REJECTED';
    },
  ): Promise<
    DelegateResult & {
      projectId: string;
      negotiationId: string;
      recruitmentStatus: RecruitmentStatus;
      transactionStatus: ProjectTransactionStatus;
      reopened: boolean;
      notReopenedReason: 'DEADLINE_PASSED' | 'PENDING_APPLICATIONS_REMAIN' | null;
      restoredFields: string[];
    }
  >;
};

/**
 * project-management 가 던지는 `ProjectContractError` 를 이 도메인의 `DomainContractError` 로
 * 옮긴다. 두 클래스는 필드가 같게 설계돼 있으나(project.types.ts 주석) 서로 instanceof 가
 * 아니므로, 여기서 옮기지 않으면 컨트롤러의 4xx 변환이 전부 500 이 된다.
 */
function rethrowAsDomainError(error: unknown): never {
  const candidate = error as { status?: number; body?: { error?: { code?: string; message?: string } } };
  const code = candidate?.body?.error?.code;
  if (
    code === 'PROJECT_NOT_FOUND' ||
    code === 'PROJECT_TRANSITION_CONFLICT' ||
    code === 'PROJECT_VERSION_CONFLICT' ||
    code === 'PROJECT_ALREADY_RESTORED' ||
    code === 'VALIDATION_ERROR'
  ) {
    throw new DomainContractError(code, candidate.body?.error?.message ?? '요청을 처리하지 못했습니다.');
  }
  throw error;
}

export function createProjectManagementAdapter(
  delegate: ProjectTransactionDelegate,
): ProjectTransactionPort {
  return {
    async getProjectNegotiationContext(
      projectId: string,
    ): Promise<ProjectNegotiationContextResponse> {
      try {
        return await delegate.getProjectNegotiationContext(projectId);
      } catch (error) {
        rethrowAsDomainError(error);
      }
    },

    async markPaymentPending(
      projectId: string,
      input: MarkPaymentPendingInput,
    ): Promise<MarkPaymentPendingResponse> {
      try {
        return await delegate.markPaymentPending(projectId, input);
      } catch (error) {
        rethrowAsDomainError(error);
      }
    },

    async startProjectTransaction(
      projectId: string,
      input: StartProjectTransactionInput,
    ): Promise<StartProjectTransactionResponse> {
      try {
        const result = await delegate.startProjectTransaction(projectId, input);
        // 제공자는 넓은 유니온을 주지만 이 경로가 성공했다면 IN_PROGRESS 하나뿐이다.
        return { ...result, transactionStatus: 'IN_PROGRESS' };
      } catch (error) {
        rethrowAsDomainError(error);
      }
    },

    async completeProjectTransaction(
      projectId: string,
      input: CompleteProjectTransactionInput,
    ): Promise<CompleteProjectTransactionResponse> {
      try {
        const result = await delegate.completeProjectTransaction(projectId, input);
        return { ...result, transactionStatus: 'COMPLETED' };
      } catch (error) {
        rethrowAsDomainError(error);
      }
    },

    async restorePreContractProject(
      projectId: string,
      input: RestorePreContractProjectInput,
    ): Promise<RestorePreContractProjectResponse> {
      try {
        const result = await delegate.restorePreContractProject(projectId, input);
        return {
          ...result,
          transactionStatus: 'NONE',
          // 이 도메인의 타입은 두 필드 튜플로 고정돼 있다. 제공자는 상황에 따라
          // acceptedApplicationId·paymentPendingAt 도 함께 비웠다고 알려 주는데
          // (project-management change-requests/0002), 그 폭을 받으려면 이쪽 타입을 넓혀야 한다 —
          // feedback_loop/2026-08-28/contracts-payments.md 항목 2.
          restoredFields: ['recruitmentStatus', 'transactionStatus'],
        };
      } catch (error) {
        rethrowAsDomainError(error);
      }
    },
  };
}
