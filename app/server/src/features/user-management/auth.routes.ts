import { Router } from "express";
import { createAuthController } from "./auth.controller";
import type { AuthSessionService } from "./auth.service";

/**
 * user-management(인증) 라우터 — 팀장 통합 반영.
 *
 * 원본(`features/user-management/prototype/server/auth.routes.ts`)과 동일하게 팩토리 함수로
 * export한다. sample-login처럼 `export default router` 하나로 끝낼 수 없는 이유: 이 서비스는
 * Supabase 포트(`AuthProvider`)·저장소(`AuthRepositories`)·비밀 키를 생성자 주입받는 구조라
 * (ADR-0009 조립 지점 원칙) 라우터 생성 시점에 이미 완성된 `AuthSessionService` 인스턴스가
 * 필요하다. 조립은 `app/server/src/app.ts`에서 한 곳만 한다.
 *
 * 경로는 `docs/naming-convention.md` §7과 원본 api-contract.md를 그대로 따른다 — 전부
 * `/api/v1/auth/...` 절대 경로이므로 app.ts는 `app.use(createAuthRouter(...))`처럼 prefix 없이
 * 마운트한다.
 */
export function createAuthRouter(service: AuthSessionService, allowedOrigin: string): Router {
  const router = Router();
  const controller = createAuthController(service, allowedOrigin);

  router.post("/api/v1/auth/registrations", controller.register);
  router.post("/api/v1/auth/email-confirmation-requests", controller.requestEmailConfirmation);
  router.post("/api/v1/auth/email-confirmations", controller.confirmEmail);
  router.post("/api/v1/auth/sessions", controller.createSession);
  router.post("/api/v1/auth/registration-completions", controller.completeRegistration);
  router.post("/api/v1/auth/oauth-authorizations", controller.createOAuthAuthorization);
  router.get("/api/v1/auth/oauth-callbacks", controller.completeOAuthCallback);
  router.post("/api/v1/auth/sessions/refresh", controller.refreshSession);
  router.delete("/api/v1/auth/sessions/current", controller.deleteCurrentSession);
  router.get("/api/v1/auth/contexts/current", controller.getCurrentContext);
  router.use(controller.errorBoundary);
  return router;
}
