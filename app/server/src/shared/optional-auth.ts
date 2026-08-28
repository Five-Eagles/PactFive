import type { NextFunction, Request, Response } from 'express';
import type { AccessTokenVerifier } from './require-auth';

/**
 * Access Token이 **있으면** 검증해 `req.user`를 채우고, 없거나 틀리면 그냥 통과시키는 미들웨어.
 *
 * `require-auth.ts`와 짝을 이룬다. 그쪽은 토큰이 없으면 401로 끊지만, 일부 공개 API는
 * "비로그인도 볼 수 있되 로그인했으면 더 많이 보여준다"는 규칙을 갖는다:
 *
 * - `GET /api/v1/projects/:projectId` — 등록 의뢰인이면 `transactionStatus`·`editableFields`가
 *   붙고, 로그인한 프리랜서면 `canApply`가 붙는다 (project-management 규칙 9·13).
 * - `GET /api/v1/projects/:projectId/recommendations` — 로그인이 아예 필요 없다 (engagement 규칙 16).
 *
 * 이 셋을 `requireAuth`로 보호하면 비로그인 사용자가 프로젝트를 볼 수 없게 되고, 아무 미들웨어도
 * 붙이지 않으면 등록 의뢰인이 자기 프로젝트의 관리 정보를 못 받는다. 그래서 세 번째 형태가 필요하다.
 *
 * **틀린 토큰을 401로 끊지 않는다.** 이 라우트들에서 인증은 "더 보여줄지"의 판단 재료일 뿐이고,
 * 만료된 토큰을 든 사용자에게 공개 정보마저 막을 이유가 없다.
 *
 * (2026-08-28 통합에서 팀장이 추가 — feedback_loop/2026-08-28/project-management.md 항목 4)
 */
export function createOptionalAuth(verifyAccessToken: AccessTokenVerifier) {
  return async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authorization = req.header('authorization');
    const accessToken =
      authorization?.startsWith('Bearer ') && authorization.length > 7
        ? authorization.slice(7)
        : undefined;

    if (accessToken) {
      try {
        req.user = await verifyAccessToken(accessToken);
      } catch {
        // 통과시킨다 — 비로그인으로 취급한다.
      }
    }
    next();
  };
}
