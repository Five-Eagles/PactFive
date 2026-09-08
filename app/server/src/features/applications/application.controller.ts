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
  throw error;
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
