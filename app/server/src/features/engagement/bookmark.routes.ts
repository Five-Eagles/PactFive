import { Router, type RequestHandler } from 'express';
import { createBookmarkController } from './bookmark.controller';
import type { EngagementService } from './bookmark.service';

/**
 * engagement 라우트 — 전부 공개 API(`/api/v1`)다.
 * 다른 도메인이 부르는 내부 계약은 없다 — 이 기능은 아무의 상태도 바꾸지 않는다.
 *
 * 추천(규칙 16)만 인증이 필요 없다. 나머지 셋은 프리랜서 전용이라 `requireAuth` 로 막고,
 * 역할 판정(의뢰인이면 403)은 서비스가 `userRead` 포트로 한다 (규칙 5·33).
 */
export function createEngagementRouter(
  service: EngagementService,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createBookmarkController(service);

  router.put('/api/v1/projects/:projectId/bookmarks', middleware.requireAuth, controller.add);
  router.delete('/api/v1/projects/:projectId/bookmarks', middleware.requireAuth, controller.remove);
  // /bookmarks/ids 를 /bookmarks 보다 먼저 등록할 필요는 없다 — 리터럴 경로 세그먼트라 겹치지
  // 않는다(:projectId 처럼 파라미터 구간과 겹칠 때만 순서가 문제된다).
  router.get('/api/v1/bookmarks/ids', middleware.requireAuth, controller.ids);
  router.get('/api/v1/bookmarks', middleware.requireAuth, controller.list);
  router.get('/api/v1/projects/:projectId/recommendations', controller.recommendations);

  return router;
}
