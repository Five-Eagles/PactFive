import type { NextFunction, Request, Response } from "express";
import { AuthProblem, RegistrationCompletionRequiredProblem, requireAllowedOrigin } from "./auth.service";
import type { AllowedOrigins, AuthSessionService, InternalRefreshResult, InternalSessionResult } from "./auth.service";

export const REFRESH_COOKIE_NAME = "__Host-pactfiveRefreshToken";
export const OAUTH_INTENT_COOKIE_NAME = "__Host-pactfiveOAuthIntent";
export const REGISTRATION_RECOVERY_COOKIE_NAME = "__Host-pactfiveRegistrationRecovery";

export const REFRESH_COOKIE_OPTIONS = Object.freeze({
  secure: true,
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
});

export const OAUTH_INTENT_COOKIE_OPTIONS = Object.freeze({
  secure: true,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60 * 1000,
});

export const REGISTRATION_RECOVERY_COOKIE_OPTIONS = Object.freeze({
  secure: true,
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 10 * 60 * 1000,
});

const OAUTH_INTENT_COOKIE_CLEAR_OPTIONS = Object.freeze({
  secure: true,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
});

const REGISTRATION_RECOVERY_COOKIE_CLEAR_OPTIONS = Object.freeze({
  secure: true,
  httpOnly: true,
  sameSite: "strict" as const,
  path: "/",
});

function readCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.header("cookie");
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readOptionalBearer(req: Request): string | undefined {
  const authorization = req.header("authorization");
  return authorization?.startsWith("Bearer ") && authorization.length > 7
    ? authorization.slice(7)
    : undefined;
}

function setNoStore(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store");
}

function setRefreshCookie(res: Response, result: InternalSessionResult | InternalRefreshResult): void {
  const maxAge = Math.max(0, result.sessionExpiresAt.getTime() - Date.now());
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, { ...REFRESH_COOKIE_OPTIONS, maxAge });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
}

function clearRegistrationRecoveryCookie(res: Response): void {
  res.clearCookie(REGISTRATION_RECOVERY_COOKIE_NAME, REGISTRATION_RECOVERY_COOKIE_CLEAR_OPTIONS);
}

function clearOAuthIntentCookie(res: Response): void {
  res.clearCookie(OAUTH_INTENT_COOKIE_NAME, OAUTH_INTENT_COOKIE_CLEAR_OPTIONS);
}

function sendProblem(res: Response, error: unknown): void {
  const problem = error instanceof AuthProblem
    ? error
    : new AuthProblem(500, "INTERNAL_ERROR", "예상하지 못한 오류입니다.");
  if (problem.clearRefreshCookie) clearRefreshCookie(res);
  if (problem.clearRegistrationRecoveryCookie) clearRegistrationRecoveryCookie(res);
  setNoStore(res);
  res.status(problem.status).json({
    error: { code: problem.code, message: problem.message, details: null },
  });
}

export function createAuthController(service: AuthSessionService, allowedOrigins: AllowedOrigins) {
  const requireMutationOrigin = (req: Request) => requireAllowedOrigin(req.header("origin"), allowedOrigins);

  return {
    register: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
        const result = await service.register(req.body);
        setNoStore(res);
        res.status(202).json(result);
      } catch (error) {
        sendProblem(res, error);
      }
    },

    requestEmailConfirmation: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
        const result = await service.requestEmailConfirmation(req.body?.email ?? "");
        setNoStore(res);
        res.status(202).json(result);
      } catch (error) {
        sendProblem(res, error);
      }
    },

    confirmEmail: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
      } catch (error) {
        sendProblem(res, error);
        return;
      }
      const pendingOAuthIntent = readCookie(req, OAUTH_INTENT_COOKIE_NAME);
      try {
        const result = await service.confirmEmail(
          req.body?.tokenHash,
          req.body?.deviceLabel,
          readCookie(req, REFRESH_COOKIE_NAME),
          pendingOAuthIntent,
        );
        setRefreshCookie(res, result);
        clearOAuthIntentCookie(res);
        setNoStore(res);
        res.status(200).json(result.body);
      } catch (error) {
        // OAuth intent nonce를 이미 취소한 뒤 후속 인증/DB 단계가 실패해도
        // 소비된 intent 쿠키가 다음 로그인 재시도를 가로막지 않게 한다.
        clearOAuthIntentCookie(res);
        sendProblem(res, error);
      }
    },

    createSession: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
      } catch (error) {
        sendProblem(res, error);
        return;
      }
      const pendingOAuthIntent = readCookie(req, OAUTH_INTENT_COOKIE_NAME);
      try {
        const result = await service.login(
          req.body,
          pendingOAuthIntent,
          readCookie(req, REFRESH_COOKIE_NAME),
        );
        setRefreshCookie(res, result);
        clearOAuthIntentCookie(res);
        setNoStore(res);
        res.status(200).json(result.body);
      } catch (error) {
        if (error instanceof RegistrationCompletionRequiredProblem) {
          res.cookie(
            REGISTRATION_RECOVERY_COOKIE_NAME,
            error.recoveryCookie,
            REGISTRATION_RECOVERY_COOKIE_OPTIONS,
          );
        }
        clearOAuthIntentCookie(res);
        sendProblem(res, error);
      }
    },

    completeRegistration: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
      } catch (error) {
        sendProblem(res, error);
        return;
      }
      const pendingOAuthIntent = readCookie(req, OAUTH_INTENT_COOKIE_NAME);
      try {
        const recoveryCookie = readCookie(req, REGISTRATION_RECOVERY_COOKIE_NAME);
        const result = await service.completeRegistration(
          req.body,
          recoveryCookie,
          pendingOAuthIntent,
          readCookie(req, REFRESH_COOKIE_NAME),
        );
        setRefreshCookie(res, result);
        clearRegistrationRecoveryCookie(res);
        clearOAuthIntentCookie(res);
        setNoStore(res);
        res.status(200).json(result.body);
      } catch (error) {
        clearOAuthIntentCookie(res);
        sendProblem(res, error);
      }
    },

    createOAuthAuthorization: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
        const existingRefresh = readCookie(req, REFRESH_COOKIE_NAME);
        const result = await service.createOAuthAuthorization(req.body, existingRefresh);
        res.cookie(OAUTH_INTENT_COOKIE_NAME, result.sealedIntent, OAUTH_INTENT_COOKIE_OPTIONS);
        setNoStore(res);
        res.status(200).json({ authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt });
      } catch (error) {
        sendProblem(res, error);
      }
    },

    completeOAuthCallback: async (req: Request, res: Response) => {
      const sealedIntent = readCookie(req, OAUTH_INTENT_COOKIE_NAME);
      try {
        if (!sealedIntent) throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보가 없습니다.");
        const result = await service.completeOAuthCallback(
          String(req.query.code ?? ""),
          sealedIntent,
          undefined,
          readCookie(req, REFRESH_COOKIE_NAME),
        );
        setRefreshCookie(res, result);
        setNoStore(res);
        clearOAuthIntentCookie(res);
        res.redirect(302, result.body.returnTo);
      } catch {
        clearOAuthIntentCookie(res);
        setNoStore(res);
        res.redirect(302, "/login?oauthError=oauth_failed");
      }
    },

    refreshSession: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
        const refreshToken = readCookie(req, REFRESH_COOKIE_NAME);
        if (!refreshToken) throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
        const result = await service.refresh(refreshToken);
        setRefreshCookie(res, result);
        setNoStore(res);
        res.status(200).json(result.body);
      } catch (error) {
        sendProblem(res, error);
      }
    },

    deleteCurrentSession: async (req: Request, res: Response) => {
      try {
        requireMutationOrigin(req);
      } catch (error) {
        sendProblem(res, error);
        return;
      }

      let logoutError: unknown;
      try {
        await service.logout(readCookie(req, REFRESH_COOKIE_NAME), readOptionalBearer(req));
      } catch (error) {
        logoutError = error;
      }

      // Origin 검사를 통과했다면 저장소/공급자 오류와 무관하게 브라우저 쿠키를 제거한다.
      clearRefreshCookie(res);
      clearOAuthIntentCookie(res);
      clearRegistrationRecoveryCookie(res);
      setNoStore(res);
      if (logoutError) {
        sendProblem(res, logoutError);
        return;
      }
      res.status(204).end();
    },

    getCurrentContext: async (req: Request, res: Response) => {
      try {
        const accessToken = readOptionalBearer(req);
        if (!accessToken) throw new AuthProblem(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
        const result = await service.getCurrentContext(accessToken);
        setNoStore(res);
        res.status(200).json(result);
      } catch (error) {
        sendProblem(res, error);
      }
    },

    errorBoundary: (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      sendProblem(res, error);
    },
  };
}
