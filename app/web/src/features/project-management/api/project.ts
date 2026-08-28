import { http } from '../../../shared/http';
import type {
  CancelProjectResponse,
  ClientProjectDetail,
  ClientProjectListResponse,
  CloseRecruitmentResponse,
  CreateProjectRequest,
  ProjectListQuery,
  ProjectListResponse,
  PublicProjectDetail,
  ReopenRecruitmentResponse,
  UpdateProjectRequest,
} from '../project.types';

/**
 * project-management API 호출 함수.
 *
 * 전부 `shared/http.ts` 를 거친다 — `fetch`/`axios` 를 직접 부르지 않는다
 * (app/web/AGENTS.md "통합 시 확인"). 경로는 `features/project-management/api-contract.md` 가
 * 고정한 값 그대로다.
 *
 * 이름은 비즈니스 행위로 짓는다 (docs/naming-convention.md §5) — `getProjects` 가 아니라
 * `searchProjects`, `postProject` 가 아니라 `registerProject`.
 */

/** A-02 목록·검색. 비로그인도 부른다 */
export function searchProjects(query: ProjectListQuery = {}): Promise<ProjectListResponse> {
  return http.get<ProjectListResponse>('/v1/projects', {
    skipAuth: true,
    query: {
      keyword: query.keyword,
      category: query.category,
      // 서버 컨트롤러가 쉼표 구분도 받는다 (project.controller.ts readStringList)
      skills: query.skills?.length ? query.skills.join(',') : undefined,
      minBudget: query.minBudget,
      maxBudget: query.maxBudget,
      recruitmentStatus: query.recruitmentStatus,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
}

/**
 * A-03 상세.
 *
 * 인증 헤더를 붙여서 부른다 — 등록 의뢰인이면 서버가 `ClientProjectDetail` 을 준다 (규칙 9).
 * 비로그인이어도 401 이 아니다(서버는 optionalAuth 로 받는다). 그래서 반환 타입이 둘 중 하나다.
 */
export function fetchProject(projectId: string): Promise<PublicProjectDetail | ClientProjectDetail> {
  return http.get<PublicProjectDetail | ClientProjectDetail>(`/v1/projects/${projectId}`);
}

/** A-01 등록. 3단계 입력을 마지막에 한 번만 보낸다 (규칙 1) */
export function registerProject(input: CreateProjectRequest): Promise<ClientProjectDetail> {
  return http.post<ClientProjectDetail>('/v1/projects', input);
}

/** A-04 수정. **바꿀 필드만 보낸다** — 안 바꿀 필드를 실어 보내면 잠금 판정에 걸린다 (규칙 15) */
export function updateProject(
  projectId: string,
  patch: UpdateProjectRequest,
): Promise<ClientProjectDetail> {
  return http.patch<ClientProjectDetail>(`/v1/projects/${projectId}`, patch);
}

/** A-05 삭제 (소프트 삭제). 이미 삭제된 것을 다시 지워도 성공이다 (규칙 21) */
export function deleteProject(projectId: string): Promise<void> {
  return http.delete<void>(`/v1/projects/${projectId}`);
}

/** A-06 모집 마감 */
export function closeRecruitment(projectId: string): Promise<CloseRecruitmentResponse> {
  return http.post<CloseRecruitmentResponse>(`/v1/projects/${projectId}/close-recruitment`);
}

/**
 * A-07 취소.
 *
 * 후처리가 하나라도 실패하면 서버가 202 를 준다 (규칙 29). `shared/http.ts` 는 2xx 를 모두
 * 성공으로 넘기므로, **호출부가 `postActions` 를 반드시 확인해야 한다** — 확인하지 않으면
 * 지원자 정리가 실패했는데도 화면이 "전부 정리됐다"고 안내하게 된다.
 */
export function cancelProject(projectId: string): Promise<CancelProjectResponse> {
  return http.post<CancelProjectResponse>(`/v1/projects/${projectId}/cancel`);
}

/** A-08 내 프로젝트 */
export function fetchMyProjects(
  clientId: string,
  query: Pick<ProjectListQuery, 'recruitmentStatus' | 'page' | 'pageSize'> = {},
): Promise<ClientProjectListResponse> {
  return http.get<ClientProjectListResponse>(`/v1/clients/${clientId}/projects`, {
    query: {
      recruitmentStatus: query.recruitmentStatus,
      page: query.page,
      pageSize: query.pageSize,
    },
  });
}

/**
 * A-13 재모집.
 *
 * `recruitmentStartAt` 은 보내지 않는다 — 서버가 현재 시각으로 갱신한다 (규칙 33).
 * 이미 `OPEN` 이면 `reopened: false` 로 아무것도 바뀌지 않는다 (규칙 35).
 */
export function reopenRecruitment(
  projectId: string,
  input: { recruitmentDeadlineAt: string; expectedProjectVersion?: number },
): Promise<ReopenRecruitmentResponse> {
  return http.post<ReopenRecruitmentResponse>(
    `/v1/projects/${projectId}/reopen-recruitment`,
    input,
  );
}
