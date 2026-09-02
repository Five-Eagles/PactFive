import type { Request, Response } from 'express';
import type { ProjectService } from './project.service';
import type { AuthContext } from './project.port';
import { createTransactionContext } from './in-memory-external.adapter';
import {
  isProjectContractError,
  type MyProjectListQuery,
  type ProjectListQuery,
  type ProjectTransactionStatus,
  type RecruitmentStatus,
} from './project.types';

/**
 * 공개 API 컨트롤러 — 팀장이 새로 작성했다 (원본 prototype/server/ 에 controller·routes 가 없다).
 *
 * 원본의 서비스는 이미 `Responded<T>`(status + body)를 돌려주므로, 이 계층이 하는 일은
 * **HTTP 경계 변환뿐**이다: 쿼리 문자열 파싱 → 서비스 호출 → 상태 코드와 본문 그대로 전달,
 * 도메인 오류를 응답 본문으로 변환. 비즈니스 판단은 하나도 넣지 않는다.
 *
 * 인증 컨텍스트는 `shared/require-auth.ts` · `shared/optional-auth.ts` 가 채운 `req.user` 에서
 * 가져온다. 원본의 `MOCK_TOKENS`(spec.md 규칙 54, 개발용 고정 토큰)는 옮기지 않았다 —
 * app/ 에는 user-management 의 Mock 인증이 이미 있고, 인증 방식이 두 벌이 되면 안 된다.
 */

function toAuth(req: Request): AuthContext | null {
  return req.user ? { userId: req.user.userId, role: req.user.role } : null;
}

function sendDomainError(res: Response, error: unknown): void {
  if (isProjectContractError(error)) {
    res.status(error.status).json(error.body);
    return;
  }
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** `?skills=REACT&skills=SQL` 과 `?skills=REACT,SQL` 을 모두 받는다 */
function readStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.filter((v): v is string => typeof v === 'string');
    return list.length > 0 ? list : undefined;
  }
  const single = readString(value);
  return single ? single.split(',').filter(Boolean) : undefined;
}

/**
 * 숫자 쿼리 파라미터. 숫자가 아니면 `NaN` 을 그대로 넘긴다 —
 * 조용히 기본값으로 바꾸면 잘못된 요청이 성공한 것처럼 보인다. 서비스의 범위 검사가 422 로 끊는다.
 */
function readNumber(value: unknown): number | undefined {
  const raw = readString(value);
  return raw === undefined ? undefined : Number(raw);
}

export function createProjectController(service: ProjectService) {
  return {
    /** A-01 POST /api/v1/projects */
    async create(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.createProject(
          toAuth(req),
          {
            title: String(body.title ?? ''),
            description: String(body.description ?? ''),
            category: String(body.category ?? ''),
            recruitmentStartAt: readString(body.recruitmentStartAt) ?? null,
            recruitmentDeadlineAt: String(body.recruitmentDeadlineAt ?? ''),
            budgetAmount: Number(body.budgetAmount),
            skillIds: readStringList(body.skillIds) ?? [],
            pricingAnalysisId: readString(body.pricingAnalysisId) ?? null,
          },
          createTransactionContext(),
        );
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-02 GET /api/v1/projects */
    list(req: Request, res: Response): void {
      try {
        const q = req.query;
        const query: ProjectListQuery = {
          keyword: readString(q.keyword),
          category: readString(q.category),
          skills: readStringList(q.skills),
          minBudget: readNumber(q.minBudget),
          maxBudget: readNumber(q.maxBudget),
          recruitmentStatus: readString(q.recruitmentStatus) as RecruitmentStatus | undefined,
          deadlineBefore: readString(q.deadlineBefore),
          sortBy: readString(q.sortBy) as ProjectListQuery['sortBy'],
          sortOrder: readString(q.sortOrder) as ProjectListQuery['sortOrder'],
          page: readNumber(q.page),
          pageSize: readNumber(q.pageSize),
        };
        const result = service.listProjects(query);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-03 GET /api/v1/projects/:projectId */
    get(req: Request, res: Response): void {
      try {
        const result = service.getProject(toAuth(req), req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-04 PATCH /api/v1/projects/:projectId */
    update(req: Request, res: Response): void {
      try {
        const body = req.body as Record<string, unknown>;
        // **보낸 키만 넘긴다.** 안 보낸 필드를 undefined 로 채워 넘기면 잠금 판정
        // (규칙 15)이 "수정하려 한 필드"를 잘못 세어 정상 요청이 409 가 된다.
        const input: Record<string, unknown> = {};
        for (const field of [
          'title',
          'description',
          'category',
          'recruitmentStartAt',
          'recruitmentDeadlineAt',
          'budgetAmount',
          'skillIds',
        ] as const) {
          if (body[field] !== undefined) input[field] = body[field];
        }
        const result = service.updateProject(toAuth(req), req.params.projectId, input);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-05 DELETE /api/v1/projects/:projectId */
    remove(req: Request, res: Response): void {
      try {
        const result = service.deleteProject(toAuth(req), req.params.projectId);
        res.status(result.status).end();
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-06 POST /api/v1/projects/:projectId/close-recruitment */
    async closeRecruitment(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.closeRecruitment(toAuth(req), req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-07 POST /api/v1/projects/:projectId/cancel */
    async cancel(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.cancelProject(toAuth(req), req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-08 GET /api/v1/clients/:clientId/projects */
    listMine(req: Request, res: Response): void {
      try {
        const q = req.query;
        const query: MyProjectListQuery = {
          recruitmentStatus: readString(q.recruitmentStatus) as RecruitmentStatus | undefined,
          transactionStatus: readString(q.transactionStatus) as
            | ProjectTransactionStatus
            | undefined,
          page: readNumber(q.page),
          pageSize: readNumber(q.pageSize),
        };
        const result = service.listMyProjects(toAuth(req), req.params.clientId, query);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** A-13 POST /api/v1/projects/:projectId/reopen-recruitment */
    reopenRecruitment(req: Request, res: Response): void {
      try {
        const body = req.body as Record<string, unknown>;
        const result = service.reopenRecruitment(toAuth(req), req.params.projectId, {
          recruitmentDeadlineAt: String(body.recruitmentDeadlineAt ?? ''),
          expectedProjectVersion:
            body.expectedProjectVersion === undefined
              ? undefined
              : Number(body.expectedProjectVersion),
        });
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  };
}
