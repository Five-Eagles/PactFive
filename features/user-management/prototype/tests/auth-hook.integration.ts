// Optional mounted-hook regression: react-test-renderer@18.3.1 must be available.
// Run from repository root: npx tsx features/user-management/prototype/tests/auth-hook.integration.ts
// All fetch responses are synthetic; no browser, seed account or external API is used.
import assert from "node:assert/strict";
import React from "react";
import { clearAccessTokenInMemory, getAccessTokenInMemory, useAuth } from "../web/useAuth";
import type { AuthenticatedSessionResponse } from "../server/auth.types";

type AuthHook = ReturnType<typeof useAuth>;
type PendingResponse = { promise: Promise<Response>; resolve: (response: Response) => void };
function deferredResponse(): PendingResponse {
  let resolve!: PendingResponse["resolve"];
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}
function session(role: "CLIENT" | "FREELANCER"): AuthenticatedSessionResponse {
  return {
    accessToken: `synthetic-${role}`,
    accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    returnTo: "/",
    user: { userId: `usr_${role}`, email: `${role}@example.test`, name: role, role, profileImageUrl: null },
  };
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

async function main() {
  // Variable import keeps this optional test out of the default dependency contract.
  const rendererPackage = "react-test-renderer";
  const { create, act } = await import(rendererPackage);
  const current: Record<string, AuthHook> = {};
  function Probe({ name, restoreOnMount = false }: { name: string; restoreOnMount?: boolean }) {
    current[name] = useAuth({ restoreOnMount });
    return React.createElement("span", null, current[name].state.status);
  }
  function probes(includeLate = false) {
    return React.createElement(React.Fragment, null,
      React.createElement(Probe, { name: "header" }),
      React.createElement(Probe, { name: "form" }),
      includeLate ? React.createElement(Probe, { name: "late", restoreOnMount: true }) : null,
    );
  }
  let renderTree: { update: (tree: React.ReactElement) => void; unmount: () => void } | undefined;
  let passed = 0;
  const originalFetch = globalThis.fetch;
  const client = session("CLIENT"); const freelancer = session("FREELANCER");
  const loginInput = { email: "synthetic@example.test", password: "synthetic-password", returnTo: "/" };
  const assertBoth = (status: AuthHook["state"]["status"], email?: string) => {
    for (const name of ["header", "form"]) {
      const state = current[name].state;
      assert.equal(state.status, status);
      if (email) { assert.equal(state.status, "authenticated"); if (state.status === "authenticated") assert.equal(state.session.user.email, email); }
    }
  };
  async function check(name: string, verify: () => Promise<void>) {
    await verify(); passed += 1; console.log(`[PASS] ${name}`);
  }
  try {
    await act(async () => { renderTree = create(probes()); });
    await check("로그인 성공이 폼과 헤더를 동시에 갱신한다", async () => {
      globalThis.fetch = async () => json(client);
      await act(async () => { await current.form.login(loginInput); });
      assertBoth("authenticated", client.user.email);
      assert.equal(getAccessTokenInMemory(), client.accessToken);
    });
    await check("새 소비자를 마운트해도 세션을 다시 복원하거나 지우지 않는다", async () => {
      let requests = 0; globalThis.fetch = async () => { requests += 1; throw new Error("예상하지 않은 요청"); };
      await act(async () => { renderTree!.update(probes(true)); });
      assertBoth("authenticated", client.user.email);
      assert.equal(current.late.state.status, "authenticated"); assert.equal(requests, 0);
    });
    await check("계정 전환 중 이전 토큰을 숨기고 모든 소비자를 새 계정으로 바꾼다", async () => {
      const pending = deferredResponse(); globalThis.fetch = () => pending.promise;
      let login!: Promise<AuthenticatedSessionResponse>;
      await act(async () => { login = current.form.login(loginInput); });
      assertBoth("submitting"); assert.equal(getAccessTokenInMemory(), null);
      await act(async () => { pending.resolve(json(freelancer)); await login; });
      assertBoth("authenticated", freelancer.user.email);
    });
    await check("이전 세션 복원의 지연 응답은 새 로그인을 덮지 않는다", async () => {
      const context = deferredResponse();
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.endsWith("/sessions/refresh")) return json(client);
        if (url.endsWith("/contexts/current")) return context.promise;
        return json(freelancer);
      };
      let restore!: Promise<unknown>;
      await act(async () => { restore = current.header.restore().catch((error) => error); });
      await act(async () => { await current.form.login(loginInput); });
      await act(async () => {
        context.resolve(json({ ...client.user, authenticated: true, accessTokenExpiresAt: client.accessTokenExpiresAt }));
        const failed = await restore as { code?: string };
        assert.equal(failed.code, "AUTH_FLOW_CANCELLED");
      });
      assertBoth("authenticated", freelancer.user.email);
    });
    await check("복원 중 일시 장애는 공유 재시도 상태이며 기존 메모리 토큰을 폐기하지 않는다", async () => {
      globalThis.fetch = async () => errorResponse("AUTH_PROVIDER_UNAVAILABLE", "잠시 후 다시 시도해 주세요.", 503);
      await act(async () => { await assert.rejects(current.header.restore()); });
      assertBoth("retryable"); assert.equal(getAccessTokenInMemory(), freelancer.accessToken);
    });
    await check("동시에 복원하는 소비자는 한 요청 묶음으로 같은 세션을 얻는다", async () => {
      let refreshCount = 0; let contextCount = 0;
      globalThis.fetch = async (input) => {
        if (String(input).endsWith("/sessions/refresh")) { refreshCount += 1; return json(freelancer); }
        contextCount += 1;
        return json({ ...freelancer.user, authenticated: true, accessTokenExpiresAt: freelancer.accessTokenExpiresAt });
      };
      await act(async () => { await Promise.all([current.header.restore(), current.form.restore()]); });
      assertBoth("authenticated", freelancer.user.email);
      assert.equal(refreshCount, 1); assert.equal(contextCount, 1);
    });
    await check("로그아웃은 즉시 공유되고 늦은 성공 응답이 새 로그인을 지우지 않는다", async () => {
      const logoutResponse = deferredResponse();
      globalThis.fetch = async (_input, init) => init?.method === "DELETE" ? logoutResponse.promise : json(client);
      let logout!: Promise<void>;
      await act(async () => { logout = current.form.logout(); });
      assertBoth("anonymous"); assert.equal(getAccessTokenInMemory(), null);
      await act(async () => { await current.form.login(loginInput); });
      await act(async () => { logoutResponse.resolve(new Response(null, { status: 204 })); await logout; });
      assertBoth("authenticated", client.user.email);
      assert.equal(getAccessTokenInMemory(), client.accessToken);
    });
    await check("늦게 실패한 이전 로그아웃도 새 로그인 상태를 지우지 않는다", async () => {
      const logoutResponse = deferredResponse();
      globalThis.fetch = async (_input, init) => init?.method === "DELETE" ? logoutResponse.promise : json(freelancer);
      let logout!: Promise<unknown>;
      await act(async () => { logout = current.header.logout().catch((error) => error); });
      await act(async () => { await current.form.login(loginInput); });
      await act(async () => { logoutResponse.resolve(errorResponse("LOGOUT_FAILED", "합성 실패", 503)); await logout; });
      assertBoth("authenticated", freelancer.user.email);
      assert.equal(getAccessTokenInMemory(), freelancer.accessToken);
    });
    await check("로그아웃 실패 안내와 비인증 상태가 모든 소비자에 공유된다", async () => {
      globalThis.fetch = async () => errorResponse("LOGOUT_FAILED", "합성 실패", 503);
      await act(async () => { await assert.rejects(current.form.logout()); });
      assertBoth("anonymous"); assert.equal(getAccessTokenInMemory(), null);
      assert.equal(current.header.state.action, "LOGOUT");
      assert.equal(current.header.state.message, "로그아웃 요청을 완료할 수 없습니다.");
    });
    await check("잘못된 로그인은 세션 만료로 바꾸지 않고 원래 문구를 공유한다", async () => {
      globalThis.fetch = async () => errorResponse("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", 401);
      await act(async () => { await assert.rejects(current.form.login(loginInput)); });
      assertBoth("anonymous"); assert.equal(getAccessTokenInMemory(), null);
      assert.equal(current.header.state.message, "이메일 또는 비밀번호가 올바르지 않습니다.");
    });
    await check("로그아웃 뒤 도착한 인증 성공은 세션을 되살리지 않는다", async () => {
      const pendingLogin = deferredResponse();
      globalThis.fetch = async (_input, init) => init?.method === "DELETE" ? new Response(null, { status: 204 }) : pendingLogin.promise;
      let login!: Promise<unknown>;
      await act(async () => { login = current.form.login(loginInput).catch((error) => error); });
      await act(async () => { await current.header.logout(); });
      await act(async () => {
        pendingLogin.resolve(json(client));
        assert.equal((await login as { code?: string }).code, "AUTH_FLOW_CANCELLED");
      });
      assertBoth("anonymous"); assert.equal(getAccessTokenInMemory(), null);
    });
    await check("외부 세션 무효화도 폼과 헤더에 즉시 반영된다", async () => {
      globalThis.fetch = async () => json(client);
      await act(async () => { await current.form.login(loginInput); });
      await act(async () => { clearAccessTokenInMemory(); });
      assertBoth("anonymous"); assert.equal(getAccessTokenInMemory(), null);
    });
    console.log(`=== mounted auth hooks: PASS ${passed}, FAIL 0 ===`);
  } finally {
    globalThis.fetch = originalFetch;
    await act(async () => { renderTree?.unmount(); clearAccessTokenInMemory(); });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
