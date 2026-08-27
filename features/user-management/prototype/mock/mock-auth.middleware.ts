import type { NextFunction, Request, RequestHandler, Response } from "express";
import { authenticateMockAuthorization } from "./auth.mock";

type MockAuthEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  AUTH_PROVIDER_MODE?: string;
};

export function createMockAuthMiddlewareFromEnvironment(
  environment: MockAuthEnvironment,
  audit: (event: { code: string }) => void = () => undefined,
): RequestHandler {
  const isDeployed = environment.NODE_ENV === "production" || Boolean(environment.VERCEL_ENV);
  if (environment.AUTH_PROVIDER_MODE !== "mock" || isDeployed) {
    throw new Error("MOCK_AUTH_STARTUP_REJECTED");
  }

  // 환경은 composition 시 한 번만 확정한다. 요청값으로 runtime을 선택하지 않는다.
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      res.locals.authContext = authenticateMockAuthorization(req.header("authorization"), "mock", audit);
      next();
    } catch {
      res.status(401).json({
        error: { code: "AUTH_REQUIRED", message: "로그인이 필요합니다.", details: null },
      });
    }
  };
}
