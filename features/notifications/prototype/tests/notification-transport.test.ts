import assert from "node:assert/strict";
import type { NotificationItem, NotificationListResponse } from "../server/notification.types";
import {
  createNotificationApi, createNotificationHttpApi, NotificationApiError, type NotificationJsonRequest,
} from "../web/api/notifications";
import { createNotificationStore } from "../web/notification.store";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const createdAt = "2026-09-08T03:00:00.000Z";
const readAt = "2026-09-08T03:05:00.000Z";
const notification: NotificationItem = {
  id: "ntf_transport", type: "APPLICATION_SUBMITTED", title: "새로운 지원이 도착했습니다",
  body: "프로젝트의 지원 내용을 확인해 주세요.", linkUrl: "/projects/prj_transport",
  resourceType: "application", resourceId: "apl_transport", readAt: null, createdAt,
};
const initialList = (): NotificationListResponse => ({ items: [{ ...notification }], unreadCount: 1, limit: 100 });
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// 앱의 ApiError처럼 별도 생성자를 쓰되 실제 app/ 또는 인증 모듈은 import하지 않는다.
class SharedHttpError extends Error {
  readonly body = { internal: "private-transport-detail" };
  readonly code = "private-transport-code";
  constructor(readonly status: number) { super("private-transport-message"); }
}

function isSafeApiError(status: number, code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof NotificationApiError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.ok(!error.message.includes("private-transport"));
    assert.ok(!JSON.stringify(error).includes("private-transport"));
    return true;
  };
}

export async function runNotificationTransportTests(check: Check) {
  await check("통합 전송: 네 API의 전체 경로와 메서드만 주입한 요청 함수로 전달한다", async () => {
    const calls: { path: string; options: { method: "GET" | "POST" } }[] = [];
    const responses = [initialList(), { unreadCount: 1 },
      { item: { ...notification, readAt }, unreadCount: 0 }, { updatedCount: 1, unreadCount: 0 }];
    const api = createNotificationApi({ request: async (path, options) => {
      calls.push({ path, options });
      return responses.shift();
    } });
    assert.deepEqual(await api.getNotificationList(), initialList());
    assert.deepEqual(await api.getUnreadCount(), { unreadCount: 1 });
    assert.equal((await api.markNotificationRead(notification.id)).item.readAt, readAt);
    assert.deepEqual(await api.markAllNotificationsRead(), { updatedCount: 1, unreadCount: 0 });
    assert.deepEqual(calls, [
      { path: "/api/v1/notifications", options: { method: "GET" } },
      { path: "/api/v1/notifications/unread-count", options: { method: "GET" } },
      { path: "/api/v1/notifications/ntf_transport/read", options: { method: "POST" } },
      { path: "/api/v1/notifications/read-all", options: { method: "POST" } },
    ]);
  });

  await check("통합 전송: 범용 어댑터는 직접 fetch하거나 인증 토큰을 요구하지 않는다", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => { fetchCalls++; throw new Error("직접 HTTP 호출 금지"); };
    try {
      const api = createNotificationApi({ request: async () => initialList() });
      assert.equal((await api.getNotificationList()).unreadCount, 1);
      assert.equal(fetchCalls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });

  await check("통합 전송: 공용 HTTP의 api 접두사와 합쳐도 api가 중복되지 않는다", async () => {
    const urls: string[] = [];
    const request: NotificationJsonRequest = async (path, options) => {
      // app/web/shared/http의 BASE_URL 기본값은 /api다. 실제 연결은 조립 지점에서 한다.
      const relativePath = path.slice("/api".length);
      urls.push(`/api${relativePath}`);
      assert.equal(options.method, "GET");
      return { unreadCount: 0 };
    };
    await createNotificationApi({ request }).getUnreadCount();
    assert.deepEqual(urls, ["/api/v1/notifications/unread-count"]);
  });

  await check("통합 전송: 별도 공용 오류 클래스의 401도 모든 조작에서 이전 알림을 숨긴다", async () => {
    for (const operation of ["refresh", "read", "all"] as const) {
      const api = createNotificationApi({ request: async () => { throw new SharedHttpError(401); } });
      const store = createNotificationStore(api, "session:transport", initialList());
      if (operation === "refresh") await store.refresh();
      else if (operation === "read") await store.markRead(notification.id);
      else await store.markAllRead();
      const snapshot = store.getSnapshot();
      assert.equal(snapshot.status, "session-expired");
      assert.deepEqual(snapshot.items, []);
      assert.equal(snapshot.unreadCount, null);
      assert.equal(snapshot.hasLoaded, false);
      assert.equal(snapshot.errorMessage, null);
      assert.ok(!JSON.stringify(snapshot).includes("private-transport"));
    }
  });

  await check("통합 전송: 400·404·서버 실패는 안전한 오류로 바꾸고 확인한 알림을 보존한다", async () => {
    for (const status of [400, 403, 404, 409, 429, 500, 503, 599]) {
      const api = createNotificationApi({ request: async () => { throw new SharedHttpError(status); } });
      const code = status === 400 ? "VALIDATION_ERROR" : status === 404 ? "NOTIFICATION_NOT_FOUND" : "INTERNAL_ERROR";
      await assert.rejects(api.getUnreadCount(), isSafeApiError(status, code));
      const store = createNotificationStore(api, "session:transport", initialList());
      await store.markRead(notification.id);
      assert.equal(store.getSnapshot().status, "ready");
      assert.deepEqual(store.getSnapshot().items, initialList().items);
      assert.equal(store.getSnapshot().unreadCount, 1);
      assert.ok(!JSON.stringify(store.getSnapshot()).includes("private-transport"));
    }
  });

  await check("통합 전송: 비정상 상태값이나 네트워크 오류를 401로 추측하지 않는다", async () => {
    for (const failure of [new TypeError("private-transport-message"), null, "private-transport-message",
      { status: "401" }, { status: NaN }, { status: 401.5 }, { status: 0 }, { status: 200 }, { status: 600 }]) {
      const api = createNotificationApi({ request: async () => { throw failure; } });
      await assert.rejects(api.getUnreadCount(), isSafeApiError(0, "NETWORK_ERROR"));
      const store = createNotificationStore(api, "session:transport", initialList());
      await store.refresh();
      assert.equal(store.getSnapshot().status, "ready");
      assert.equal(store.getSnapshot().unreadCount, 1);
    }
  });

  await check("통합 전송: 주입한 성공 JSON도 기존 목록 DTO 검증을 생략하지 않는다", async () => {
    for (const response of [null, undefined, "<html>fallback</html>", {},
      { items: [], limit: 100, unreadCount: -1 },
      { ...initialList(), items: [{ ...notification, linkUrl: "https://example.com" }] },
      { ...initialList(), items: [notification, notification] }]) {
      await assert.rejects(createNotificationApi({ request: async () => response }).getNotificationList(),
        isSafeApiError(502, "INVALID_RESPONSE"));
    }
  });

  await check("통합 전송: DTO 허용 필드만 반환하고 읽음 응답의 다른 ID를 거부한다", async () => {
    const api = createNotificationApi({ request: async () => ({
      ...initialList(), items: [{ ...notification, recipientId: "private-recipient", dedupeKey: "private-dedupe" }],
    }) });
    assert.deepEqual(await api.getNotificationList(), initialList());
    const wrongRead = createNotificationApi({ request: async () => ({
      item: { ...notification, id: "ntf_other", readAt }, unreadCount: 0,
    }) });
    await assert.rejects(wrongRead.markNotificationRead(notification.id), isSafeApiError(502, "INVALID_RESPONSE"));
    const unreadRead = createNotificationApi({ request: async () => ({ item: notification, unreadCount: 1 }) });
    await assert.rejects(unreadRead.markNotificationRead(notification.id), isSafeApiError(502, "INVALID_RESPONSE"));
  });

  await check("통합 전송: 잘못된 개별 읽음 ID는 공용 요청 함수를 호출하기 전에 거부한다", async () => {
    let calls = 0;
    const api = createNotificationApi({ request: async () => { calls++; return {}; } });
    for (const id of ["", "../read-all", "ntf_other?recipientId=other", "ntf_other\n", "x".repeat(31)]) {
      await assert.rejects(api.markNotificationRead(id), isSafeApiError(400, "VALIDATION_ERROR"));
    }
    assert.equal(calls, 0);
  });

  await check("통합 전송: 독립 HTTP 어댑터의 사용자 지정 경로·최신 토큰·쿠키 설정을 유지한다", async () => {
    const requests: { url: string; token: string | null; method?: string; cache?: RequestCache; credentials?: RequestCredentials }[] = [];
    let token: string | null = "synthetic:first";
    const api = createNotificationHttpApi({ baseUrl: "/custom/api/notifications/", getAccessToken: () => token,
      fetch: async (url, options) => {
        requests.push({ url: String(url), token: new Headers(options?.headers).get("Authorization"),
          method: options?.method, cache: options?.cache, credentials: options?.credentials });
        return json({ unreadCount: 0 });
      },
    });
    await api.getUnreadCount();
    token = "synthetic:second";
    await api.getUnreadCount();
    token = null;
    await assert.rejects(api.getUnreadCount(), isSafeApiError(401, "UNAUTHORIZED"));
    assert.deepEqual(requests, ["first", "second"].map(session => ({
      url: "/custom/api/notifications/unread-count", token: `Bearer synthetic:${session}`,
      method: "GET", cache: "no-store", credentials: "include",
    })));
  });

  await check("통합 전송: 독립 HTTP는 정확한 200과 JSON을 요구하고 401을 정규화한다", async () => {
    for (const response of [json({ unreadCount: 0 }, 201), new Response(null, { status: 204 }),
      new Response("<html>fallback</html>", { status: 200 })]) {
      const api = createNotificationHttpApi({ getAccessToken: () => "synthetic:token", fetch: async () => response });
      await assert.rejects(api.getUnreadCount(), isSafeApiError(502, "INVALID_RESPONSE"));
    }
    const unauthorized = createNotificationHttpApi({ getAccessToken: () => "synthetic:token",
      fetch: async () => json({ error: { message: "private-transport-message" } }, 401) });
    await assert.rejects(unauthorized.getUnreadCount(), isSafeApiError(401, "UNAUTHORIZED"));
  });
}
