import {
  acceptApplication,
  createApplication,
  getApplication,
  getApplicationEligibility,
  getApplicationOperation,
  listMyApplications,
  listProjectApplications,
  rejectApplication,
  type ApplicationServiceDeps,
} from './application.service';
import {
  ApplicationApiError,
  isApplicationApiError,
  type CreateApplicationBody,
  type ListQuery,
} from './application.types';

export type ApplicationHttpResult = { httpStatus: number; body: unknown };

function toHttp(error: unknown): ApplicationHttpResult {
  if (isApplicationApiError(error)) {
    return { httpStatus: error.httpStatus, body: error.body };
  }
  // 2026-09-10 추가 — 원래 여기서 미인식 에러를 그대로 throw했다. 이 함수는 controller의
  // catch 블록 안에서 호출되는데(`return toHttp(error)`), catch 안에서 던진 예외는 그
  // catch가 속한 try를 다시 타지 않고 그대로 밖으로 빠져나간다. application.router.ts의
  // 라우트 핸들러에는 자체 try/catch가 없어서(controller가 이미 처리한다고 가정한
  // 설계), 이 예외가 결국 Express async 핸들러 밖으로 새 나가 unhandled rejection이
  // 됐다 — 전역 handler도 없어(dev-server.ts) Node가 프로세스 전체를 죽였다(실제로
  // 2026-09-10 ApplicationIdempotencyKey.bodyHash 컬럼 길이 초과로 재현됨). 다른 기능
  // 컨트롤러(project.controller.ts 등)의 sendDomainError()와 같은 방식으로, 여기서도
  // 원인을 로깅하고 제네릭 500으로 막는다 — 이 요청 하나만 실패해야지 서버 전체가
  // 죽으면 안 된다.
  console.error('[applications] 예상하지 못한 오류:', error);
  return {
    httpStatus: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } },
  };
}

/** HTTP 프레임워크와 무관한 controller — ai-pricing/pricing-analysis.controller.ts와 같은 형태. */
export function createApplicationController(deps: ApplicationServiceDeps) {
  return {
    async eligibility(projectId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await getApplicationEligibility(deps, projectId, actorUserId) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async create(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateApplicationBody,
      idempotencyKey: string | undefined,
    ): Promise<ApplicationHttpResult> {
      try {
        const result = await createApplication(deps, projectId, actorUserId, input, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result.body };
      } catch (error) {
        return toHttp(error);
      }
    },
    async listForProject(
      projectId: string,
      actorUserId: string | undefined,
      query: ListQuery | undefined,
    ): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await listProjectApplications(deps, projectId, actorUserId, query) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async listMine(actorUserId: string | undefined, query: ListQuery | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await listMyApplications(deps, actorUserId, query) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async getOne(applicationId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await getApplication(deps, applicationId, actorUserId) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async getOperation(operationId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await getApplicationOperation(deps, operationId, actorUserId) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async accept(
      applicationId: string,
      actorUserId: string | undefined,
      idempotencyKey: string | undefined,
    ): Promise<ApplicationHttpResult> {
      try {
        const result = await acceptApplication(deps, applicationId, actorUserId, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result };
      } catch (error) {
        return toHttp(error);
      }
    },
    async reject(applicationId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        const result = await rejectApplication(deps, applicationId, actorUserId);
        return { httpStatus: result.httpStatus, body: result };
      } catch (error) {
        return toHttp(error);
      }
    },
  };
}

export { ApplicationApiError };
