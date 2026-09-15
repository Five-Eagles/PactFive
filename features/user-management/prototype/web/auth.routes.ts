import { safeReturnToOrRoot } from "../shared/return-to";
import {
  createEmailConfirmationFragmentCapture,
  type EmailConfirmationFragmentResult,
  type EmailConfirmationFragmentSource,
} from "./email-confirmation-token";

export const AUTH_ROUTES = {
  login: "/login",
  signUp: "/sign-up",
  emailConfirmation: "/auth/confirm",
  accountWithdrawal: "/settings/account/withdrawal",
} as const;

export function buildLoginPath(returnTo?: string): string {
  if (returnTo === undefined) return AUTH_ROUTES.login;
  return `${AUTH_ROUTES.login}?returnTo=${encodeURIComponent(safeReturnToOrRoot(returnTo))}`;
}

export function buildSignUpPath(returnTo?: string): string {
  if (returnTo === undefined) return AUTH_ROUTES.signUp;
  return `${AUTH_ROUTES.signUp}?returnTo=${encodeURIComponent(safeReturnToOrRoot(returnTo))}`;
}

export function parseSignUpRoute(search: string): { mode: "register" | "recovery"; returnTo: string } {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    mode: params.get("mode") === "recovery" ? "recovery" : "register",
    returnTo: safeReturnToOrRoot(params.get("returnTo") ?? undefined),
  };
}

/**
 * 앱 bootstrap에서 React 모듈을 불러오기 전에 생성하고 호출한다.
 * 예: const capture = createEmailConfirmationBootstrap(); capture({ ...location, replaceState: ... })
 */
export function createEmailConfirmationBootstrap(): (
  input: EmailConfirmationFragmentSource,
) => EmailConfirmationFragmentResult {
  const capture = createEmailConfirmationFragmentCapture();
  return (input) => input.pathname === AUTH_ROUTES.emailConfirmation
    ? capture(input)
    : { status: "invalid", tokenHash: null };
}
