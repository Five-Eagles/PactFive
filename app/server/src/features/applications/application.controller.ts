import {
  acceptApplication,
  createApplication,
  listMyApplications,
  listProjectApplications,
  rejectApplication,
  type ApplicationServiceDeps,
} from './application.service';
import { ApplicationApiError, isApplicationApiError, type CreateApplicationInput } from './application.types';

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
    async create(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateApplicationInput,
      idempotencyKey: string | undefined,
    ): Promise<ApplicationHttpResult> {
      try {
        const result = await createApplication(deps, projectId, actorUserId, input, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result.body };
      } catch (error) {
        return toHttp(error);
      }
    },
    async listForProject(projectId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await listProjectApplications(deps, projectId, actorUserId) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async listMine(actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await listMyApplications(deps, actorUserId) };
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
        return {
          httpStatus: 200,
          body: await acceptApplication(deps, applicationId, actorUserId, idempotencyKey),
        };
      } catch (error) {
        return toHttp(error);
      }
    },
    async reject(applicationId: string, actorUserId: string | undefined): Promise<ApplicationHttpResult> {
      try {
        return { httpStatus: 200, body: await rejectApplication(deps, applicationId, actorUserId) };
      } catch (error) {
        return toHttp(error);
      }
    },
  };
}

export { ApplicationApiError };
