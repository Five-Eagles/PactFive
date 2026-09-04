import type { Request, Response } from 'express';
import type { EngagementService } from './bookmark.service';
import { isEngagementError, type AuthContext } from './bookmark.types';

/**
 * engagement 공개 API 컨트롤러 — 팀장이 새로 작성했다
 * (원본 prototype/server/ 에 controller·routes 가 없다).
 *
 * 서비스가 이미 `Responded<T>`(status + body)를 돌려주므로 이 계층은 HTTP 경계 변환만 한다.
 */

function toAuth(req: Request): AuthContext | null {
  return req.user ? { userId: req.user.userId, role: req.user.role } : null;
}

function sendDomainError(res: Response, error: unknown): void {
  if (isEngagementError(error)) {
    res.status(error.status).json(error.body);
    return;
  }
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } });
}

/** 숫자가 아니면 NaN 을 그대로 넘긴다 — 서비스의 범위 검사가 422 로 끊는다 */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'string' && value.length > 0 ? Number(value) : undefined;
}

export function createBookmarkController(service: EngagementService) {
  return {
    /** PUT /api/v1/projects/:projectId/bookmarks */
    async add(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.addBookmark(toAuth(req), req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** DELETE /api/v1/projects/:projectId/bookmarks */
    async remove(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.removeBookmark(toAuth(req), req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** GET /api/v1/bookmarks — 경로에 사용자 id 가 없다 (규칙 9) */
    async list(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBookmarks(toAuth(req), {
          page: readNumber(req.query.page),
          pageSize: readNumber(req.query.pageSize),
        });
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /**
     * GET /api/v1/bookmarks/ids — 저장한 프로젝트 id 목록 (규칙 36, CR-0008).
     * 화면이 카드마다 북마크 여부를 대조하는 데 쓴다. 페이지를 나누지 않는다.
     */
    async ids(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.listBookmarkedProjectIds(toAuth(req));
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** GET /api/v1/projects/:projectId/recommendations — 비로그인도 볼 수 있다 (규칙 16) */
    async recommendations(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getRecommendations(req.params.projectId);
        res.status(result.status).json(result.body);
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  };
}
