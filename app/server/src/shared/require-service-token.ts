import type { NextFunction, Request, Response } from 'express';

/**
 * 서버 간(service-to-service) 내부 API 보호용 미들웨어.
 *
 * `shared/require-auth.ts`(사용자 Access Token)와는 목적이 다르다 — 일부 내부 API는
 * "로그인한 사용자"가 아니라 "우리 백엔드의 다른 기능(또는 아직 별도 배포되는 다른 서비스)"만
 * 호출해야 한다. 예: `features/contracts-payments/project-transaction.routes.ts`의
 * `/internal/v1/projects/:projectId/...` — api-contract.md가 "서버 간 토큰. 브라우저·사용자
 * 토큰 거부"라고 명시했다(J1). 사용자 Bearer 토큰을 여기서 받아주면 이 요구사항을 어기게 된다.
 *
 * 검증은 고정 공유 비밀(`INTERNAL_SERVICE_TOKEN`)과의 단순 일치 비교다 — Supabase 같은 벤더가
 * 아니라 이 리포 안의 서비스 간 약속이므로 포트/어댑터로 감싸지 않는다.
 */
export function createRequireServiceToken(expectedToken: string | undefined) {
  return function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') && authorization.length > 7 ? authorization.slice(7) : undefined;

    if (!expectedToken) {
      // 배포 전 설정 누락 — 열어주는 대신 명시적으로 503을 준다 (fail-closed).
      res.status(503).json({
        error: { code: 'INTERNAL_SERVICE_NOT_CONFIGURED', message: '내부 서비스 인증이 준비되지 않았습니다.', details: null },
      });
      return;
    }

    if (!token || token !== expectedToken) {
      res.status(401).json({
        error: { code: 'INTERNAL_SERVICE_AUTH_REQUIRED', message: '내부 서비스 인증이 필요합니다.', details: null },
      });
      return;
    }

    next();
  };
}
