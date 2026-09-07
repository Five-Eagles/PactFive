import { http } from '../../../shared/http';
import type {
  AcceptApplicationResponse,
  CreateApplicationInput,
  CreateApplicationResponse,
  ListMyApplicationsResponse,
  ListProjectApplicationsResponse,
  RejectApplicationResponse,
} from '../application.types';

/**
 * applications 공개 API 5종. 전부 `shared/http.ts`를 거친다(app/web/AGENTS.md "폴더 간 접점").
 * 경로는 `features/applications/api-contract.md`가 고정한 값 그대로다.
 */

export function createApplication(
  projectId: string,
  input: CreateApplicationInput,
  idempotencyKey: string,
): Promise<CreateApplicationResponse> {
  return http.post<CreateApplicationResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/applications`,
    input,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

export function fetchProjectApplications(projectId: string): Promise<ListProjectApplicationsResponse> {
  return http.get<ListProjectApplicationsResponse>(
    `/v1/projects/${encodeURIComponent(projectId)}/applications`,
  );
}

export function fetchMyApplications(): Promise<ListMyApplicationsResponse> {
  return http.get<ListMyApplicationsResponse>('/v1/applications/me');
}

export function acceptApplication(applicationId: string): Promise<AcceptApplicationResponse> {
  return http.post<AcceptApplicationResponse>(
    `/v1/applications/${encodeURIComponent(applicationId)}/accept`,
    undefined,
    // api-contract.md — 수락은 지원 ID에서 유도되는 고정 키다. 서버도 헤더가 없으면
    // `application-accept-{applicationId}`로 같은 값을 유도하므로(application.service.ts),
    // 여기서도 같은 값을 명시해 재시도 시 같은 요청으로 취급되게 한다.
    { headers: { 'Idempotency-Key': `application-accept-${applicationId}` } },
  );
}

export function rejectApplication(applicationId: string): Promise<RejectApplicationResponse> {
  return http.post<RejectApplicationResponse>(
    `/v1/applications/${encodeURIComponent(applicationId)}/reject`,
  );
}
