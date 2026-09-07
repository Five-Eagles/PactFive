import type { ProjectReviewContext, ProjectReviewContextPort } from './review.types';

/**
 * project-management + contracts-payments delegate 합성.
 *
 * reviews가 필요로 하는 프로젝트 조각(`clientId`·`freelancerId`·`transactionStatus`·
 * `contractStatus`·`contractId`)은 어느 한 기능도 통째로 갖고 있지 않다 —
 * `clientId`·`transactionStatus`는 project-management(`getProjectNegotiationContext`),
 * `freelancerId`·`contractId`·`contractStatus`는 contracts-payments
 * (`findContractByProjectId`)가 정본이다. 이 폴더는 두 폴더를 직접 import하지 않는다
 * (app/web/AGENTS.md "폴더 간 접점") — 여기서는 그 모양만 구조적으로 기대하는 로컬 delegate
 * 타입을 선언하고, 실제 구현은 app.ts에서 `projectContractService`·
 * `contractsPaymentsRepository`를 그대로 끼운다.
 *
 * 계약이 아직 없으면(`findContractByProjectId`가 undefined) `null`을 돌려준다 — 리뷰가
 * 의미를 갖는 건 거래가 COMPLETED까지 간 프로젝트뿐이고, 그건 계약 체결을 거쳤다는 뜻이라
 * 실무에서는 일어나지 않아야 하는 경우다. 별도 오류 코드를 새로 만들지 않고
 * `PROJECT_NOT_FOUND`로 합류시킨다(review.service.ts) — 이 판단은 CR-0012와 같은 원칙으로
 * feedback_loop에 남긴다.
 */
export type ProjectNegotiationContextDelegate = {
  getProjectNegotiationContext(projectId: string): Promise<{
    projectId: string;
    clientId: string;
    transactionStatus: ProjectReviewContext['transactionStatus'];
  }>;
};

export type ContractByProjectDelegate = {
  findContractByProjectId(projectId: string):
    | { contractId: string; freelancerId: string; status: ProjectReviewContext['contractStatus'] }
    | undefined;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 404
  );
}

export function createProjectReviewContextAdapter(
  projectDelegate: ProjectNegotiationContextDelegate,
  contractDelegate: ContractByProjectDelegate,
): ProjectReviewContextPort {
  return {
    async getProjectContext(projectId: string): Promise<ProjectReviewContext | null> {
      let project;
      try {
        project = await projectDelegate.getProjectNegotiationContext(projectId);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
      const contract = contractDelegate.findContractByProjectId(projectId);
      if (!contract) return null;
      return {
        projectId: project.projectId,
        clientId: project.clientId,
        freelancerId: contract.freelancerId,
        transactionStatus: project.transactionStatus,
        contractStatus: contract.status,
        contractId: contract.contractId,
      };
    },
  };
}
