import { Router } from "express";
import { createAuthController } from "./auth.controller";
import type { AllowedOrigins, AuthSessionService } from "./auth.service";

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
 *
 * 2026-08-28 통합: 두 번째 인자가 `string`에서 `AllowedOrigins`(문자열 또는 문자열 배열)로
 * 넓어졌다. 2026-08-27 반영에서 팀장이 "CORS는 여러 오리진을 허용하는데 Origin 검증은 첫
 * 오리진만 본다"고 잠정 처리했던 지점을, 담당자가 원본에서 직접 해결해 왔다 —
 * feedback_loop/2026-08-28/user-management.md 항목 1.
 */
export function createAuthRouter(service: AuthSessionService, allowedOrigins: AllowedOrigins): Router {
  const router = Router();
  const controller = createAuthController(service, allowedOrigins);

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
