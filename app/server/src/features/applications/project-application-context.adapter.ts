import type { ProjectApplicationContext, ProjectApplicationContextPort } from './application.types';

/**
 * project-management delegate — 읽기 전용.
 *
 * applications의 create/list/accept/reject는 프로젝트의 `clientId`·`recruitmentStatus`·
 * `transactionStatus`·`acceptedApplicationId`가 필요하다(누가 의뢰인인지, 모집이 열려 있는지,
 * 이미 다른 지원이 수락됐는지). 이 네 필드는 project-management의
 * `getProjectNegotiationContext`가 이미 그대로 반환한다 — 여기서는 그 모양을 구조적으로만
 * 기대하는 로컬 delegate 타입(`ProjectContractServiceDelegate`)을 선언해 project-management
 * 폴더를 직접 import하지 않는다 (app/web/AGENTS.md "폴더 간 접점", contracts-payments/
 * project-management.adapter.ts와 같은 패턴). 실제 구현은 app.ts에서 `projectContractService`를
 * 그대로 끼운다.
 *
 * 프로젝트를 찾지 못하면(404) `null`을 돌려준다 — applications 쪽 서비스가
 * `PROJECT_NOT_FOUND`로 다시 던진다.
 */
export type ProjectContractServiceDelegate = {
  getProjectNegotiationContext(projectId: string): Promise<{
    projectId: string;
    clientId: string;
    recruitmentStatus: ProjectApplicationContext['recruitmentStatus'];
    transactionStatus: ProjectApplicationContext['transactionStatus'];
    acceptedApplicationId: string | null;
  }>;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 404
  );
}

export function createProjectApplicationContextAdapter(
  delegate: ProjectContractServiceDelegate,
): ProjectApplicationContextPort {
  return {
    async getProjectContext(projectId: string): Promise<ProjectApplicationContext | null> {
      try {
        const context = await delegate.getProjectNegotiationContext(projectId);
        return {
          projectId: context.projectId,
          clientId: context.clientId,
          recruitmentStatus: context.recruitmentStatus,
          transactionStatus: context.transactionStatus,
          acceptedApplicationId: context.acceptedApplicationId,
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
  };
}
