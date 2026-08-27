import type { NextFunction, Request, Response } from 'express';

/**
 * 인증된 사용자 컨텍스트 — user-management의 `AuthContext`(§ auth.types.ts)의 최소 부분집합.
 * 여러 기능이 "로그인한 사용자 + 역할"만 필요로 하므로 여기서는 이 최소 형태만 공유한다
 * (app/web/AGENTS.md와 같은 원칙 — 같은 것이 두 번째로 필요해질 때 shared/로 올린다. 이 미들웨어는
 * user-management(로그인)와 contracts-payments(계약 소유자 검증)가 동시에 필요로 해 이 시점에
 * shared/로 올렸다).
 */
export type AuthenticatedUser = {
  userId: string;
  role: 'CLIENT' | 'FREELANCER';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** requireAuth를 통과한 요청에만 채워진다. */
      user?: AuthenticatedUser;
    }
  }
}

export type AccessTokenVerifier = (accessToken: string) => Promise<AuthenticatedUser>;

/**
 * Access Token(Bearer)을 검증해 `req.user`를 채우는 미들웨어를 만든다.
 *
 * 실제 검증 로직(Supabase 세션 확인 등)은 이 파일이 알지 못한다 — 벤더 SDK를 여기서 직접
 * import하지 않는다(ADR-0009). 대신 컨트롤러/서비스와 마찬가지로 포트 뒤에 두고, 조립 지점인
 * `app/server/src/app.ts`에서 실제 검증 함수(개발 중에는 user-management의 Mock 인증, 이후에는
 * `AuthProvider.verifyAccessToken` 기반 함수)를 주입한다.
 */
export function createRequireAuth(verifyAccessToken: AccessTokenVerifier) {
  return async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authorization = req.header('authorization');
    const accessToken =
      authorization?.startsWith('Bearer ') && authorization.length > 7 ? authorization.slice(7) : undefined;

    if (!accessToken) {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.', details: null } });
      return;
    }

    try {
      req.user = await verifyAccessToken(accessToken);
      next();
    } catch {
      res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.', details: null } });
    }
  };
}
