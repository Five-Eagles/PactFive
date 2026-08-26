import { Router } from "express";
import { createAuthController } from "./auth.controller";
import type { AuthSessionService } from "./auth.service";

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
