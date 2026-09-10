import assert from "node:assert/strict";
import { createAuthViewStore, type AuthViewState } from "../web/useAuth";

function authenticatedState(role: "CLIENT" | "FREELANCER"): AuthViewState {
  return {
    status: "authenticated", message: null, action: null,
    session: {
      accessToken: `synthetic-${role}`,
      accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
      returnTo: "/",
      user: { userId: `usr_${role}`, email: `${role}@example.test`, name: role, role, profileImageUrl: null },
    },
  };
}

export async function runAuthViewStoreTests(
  test: (group: string, name: string, action: () => unknown | Promise<unknown>) => Promise<void>,
): Promise<void> {
  const group = "인증 화면 동기화";
  await test(group, "헤더와 로그인 폼 구독자가 같은 로그인 성공을 즉시 관찰한다", () => {
    const store = createAuthViewStore();
    const header: AuthViewState[] = []; const form: AuthViewState[] = [];
    store.subscribe(() => header.push(store.getSnapshot()));
    store.subscribe(() => form.push(store.getSnapshot()));
    const loggedIn = authenticatedState("CLIENT");
    store.publish(loggedIn);
    assert.deepEqual(header, [loggedIn]); assert.deepEqual(form, [loggedIn]);
    assert.equal(header[0], form[0]);
  });
  await test(group, "뒤늦게 참여한 소비자도 현재 세션을 읽고 스냅샷 참조는 안정적이다", () => {
    const store = createAuthViewStore(); const loggedIn = authenticatedState("CLIENT");
    store.publish(loggedIn);
    assert.equal(store.getSnapshot(), loggedIn);
    assert.equal(store.getSnapshot(), store.getSnapshot());
  });
  await test(group, "계정 전환과 로그아웃이 모든 구독자에게 순서대로 전달된다", () => {
    const store = createAuthViewStore(); const observed: AuthViewState[] = [];
    store.subscribe(() => observed.push(store.getSnapshot()));
    const client = authenticatedState("CLIENT"); const freelancer = authenticatedState("FREELANCER");
    const submitting: AuthViewState = { status: "submitting", message: null, action: null };
    const anonymous: AuthViewState = { status: "anonymous", message: null, action: null };
    for (const state of [client, submitting, freelancer, anonymous]) store.publish(state);
    assert.deepEqual(observed, [client, submitting, freelancer, anonymous]);
    assert.equal(store.getSnapshot().status, "anonymous");
  });
  await test(group, "구독 해제 후에는 해당 소비자에게 알리지 않는다", () => {
    const store = createAuthViewStore(); let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });
    store.publish(authenticatedState("CLIENT")); unsubscribe(); unsubscribe();
    store.publish(authenticatedState("FREELANCER"));
    assert.equal(calls, 1);
  });
  await test(group, "서버 렌더 스냅샷은 브라우저 인증 상태를 노출하지 않는다", () => {
    const store = createAuthViewStore(); const initial = store.getServerSnapshot();
    store.publish(authenticatedState("CLIENT"));
    assert.equal(store.getServerSnapshot(), initial);
    assert.deepEqual(initial, { status: "anonymous", message: null, action: null });
  });
}
