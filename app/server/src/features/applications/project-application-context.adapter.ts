import type { ProjectApplicationContext, ProjectApplicationContextPort } from './application.types';

/**
 * project-management delegate — 읽기 전용.
 *
 * applications의 create/list/accept/reject는 프로젝트의 `clientId`·`recruitmentStatus`·
 * `transactionStatus`·`acceptedApplicationId`가 필요하다(누가 의뢰인인지, 모집이 열려 있는지,
 * 이미 다른 지원이 수락됐는지). 이 필드들은 project-management의
 * `getProjectNegotiationContext`가 이미 그대로 반환한다 — 여기서는 그 모양을 구조적으로만
 * 기대하는 로컬 delegate 타입(`ProjectContractServiceDelegate`)을 선언해 project-management
 * 폴더를 직접 import하지 않는다 (app/web/AGENTS.md "폴더 간 접점", contracts-payments/
 * project-management.adapter.ts와 같은 패턴). 실제 구현은 express-app.ts에서 `projectContractService`를
 * 그대로 끼운다.
 *
 * `recruitmentDeadlineAt`도 같은 응답에 이미 들어있다(project-contract.service.ts 109-124행,
 * PR #83 이식 시 확인) — PM 쪽 코드 변경 없이 여기서 구조적 타입만 넓혀서 통과시킨다
 * (`getApplicationEligibility`의 `DEADLINE_PASSED` 판정용, 2026-09-07).
 *
 * 프로젝트를 찾지 못하면(404) `null`을 돌려준다 — applications 쪽 서비스가
 * `PROJECT_NOT_FOUND`로 다시 던진다.
 */
export type ProjectContractServiceDelegate = {
  /** CR-AP-001 — project-management 의 지원 건수 갱신 (project-contract.service.ts) */
  bumpApplicationCounts(
    projectId: string,
    delta: { applicationCount?: number; pendingApplicationCount?: number },
  ): Promise<{ applicationCount: number; pendingApplicationCount: number }>;

  getProjectNegotiationContext(projectId: string): Promise<{
    projectId: string;
    clientId: string;
    title: string;
    recruitmentStatus: ProjectApplicationContext['recruitmentStatus'];
    transactionStatus: ProjectApplicationContext['transactionStatus'];
    acceptedApplicationId: string | null;
    recruitmentDeadlineAt?: string | null;
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
    /** CR-AP-001 — 그대로 위임한다. 음수 방지·저장은 project-management 가 한다 */
    bumpApplicationCounts(projectId, delta) {
      return delegate.bumpApplicationCounts(projectId, delta);
    },

    async getProjectContext(projectId: string): Promise<ProjectApplicationContext | null> {
      try {
        const context = await delegate.getProjectNegotiationContext(projectId);
        return {
          projectId: context.projectId,
          clientId: context.clientId,
          title: context.title,
          recruitmentStatus: context.recruitmentStatus,
          transactionStatus: context.transactionStatus,
          acceptedApplicationId: context.acceptedApplicationId,
          recruitmentDeadlineAt: context.recruitmentDeadlineAt ?? null,
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
  };
}
