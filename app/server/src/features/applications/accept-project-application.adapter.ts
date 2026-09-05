import type {
  AcceptProjectApplicationDelegate,
  AcceptProjectApplicationDelegateInput,
  AcceptProjectApplicationDelegateResult,
} from './application.types';

/**
 * project-management delegate — 지원 수락.
 *
 * 실 검증(같은 지원인지 먼저 보기 — 규칙 55, OPEN+NONE 조건, 낙관적 잠금)은
 * project-management의 `acceptProjectApplication`(project-contract.service.ts, 규칙 36·55)
 * 소유다. applications는 여기 위임하고, 성공하면 자기 쪽 지원 행 상태(ACCEPTED)와 잔여
 * PENDING 일괄 거절(AUTO_OTHER_ACCEPTED)만 이어서 수행한다(application.service.ts) —
 * ai-pricing의 project-budget-application.adapter.ts와 같은 위임 원칙.
 *
 * `expectedProjectVersion`은 보내지 않는다 — applications 공개 API(`api-contract.md`)에
 * 프로젝트 버전 개념이 없다. project-contract.service.ts의 `checkVersion`은 이 필드가
 * undefined면 버전 검사를 건너뛴다(같은 파일 확인) — 그래서 생략해도 안전하다.
 */
export type ProjectContractAcceptDelegate = {
  acceptProjectApplication(
    projectId: string,
    input: {
      requestId: string;
      idempotencyKey: string;
      occurredAt: string;
      actorUserId: string;
      applicationId: string;
    },
  ): Promise<{
    projectId: string;
    acceptedApplicationId: string;
    recruitmentStatus: AcceptProjectApplicationDelegateResult['recruitmentStatus'];
    transactionStatus: AcceptProjectApplicationDelegateResult['transactionStatus'];
    alreadyProcessed: boolean;
  }>;
};

export function createAcceptProjectApplicationAdapter(
  delegate: ProjectContractAcceptDelegate,
): AcceptProjectApplicationDelegate {
  return {
    async acceptProjectApplication(
      projectId: string,
      input: AcceptProjectApplicationDelegateInput,
    ): Promise<AcceptProjectApplicationDelegateResult> {
      const result = await delegate.acceptProjectApplication(projectId, {
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
        actorUserId: input.actorUserId,
        applicationId: input.applicationId,
      });
      return {
        projectId: result.projectId,
        acceptedApplicationId: result.acceptedApplicationId,
        recruitmentStatus: result.recruitmentStatus,
        transactionStatus: result.transactionStatus,
        alreadyProcessed: result.alreadyProcessed,
      };
    },
  };
}
