import assert from "node:assert/strict";
import type { NotificationApi, NotificationItem, NotificationListResponse, ReadNotificationResponse } from "../server/notification.types";
import { createNotificationHttpApi, NotificationApiError } from "../web/api/notifications";
import { createNotificationApiMock } from "../mock/notification-api.mock";
import { createNotificationStore } from "../web/notification.store";

type Check = (name: string, run: () => void | Promise<void>) => Promise<void>;

const item: NotificationItem = {
  id: "ntf_client_test001",
  type: "APPLICATION_SUBMITTED",
  title: "새로운 지원이 도착했습니다",
  body: "프로젝트의 지원 내용을 확인해 주세요.",
  linkUrl: "/projects/prj_client_test001",
  resourceType: "application",
  resourceId: "apl_client_test001",
  readAt: null,
  createdAt: "2026-09-07T03:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function httpWithResponse(body: unknown, status = 200) {
  const fakeFetch: typeof globalThis.fetch = async () => jsonResponse(body, status);
  return createNotificationHttpApi({ getAccessToken: () => "synthetic-client-token", fetch: fakeFetch });
}

function isApiError(status: number) {
  return (error: unknown): boolean => error instanceof NotificationApiError && error.status === status;
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function initialList(): NotificationListResponse {
  return { items: [{ ...item }], unreadCount: 1, limit: 100 };
}

function stubApi(overrides: Partial<NotificationApi> = {}): NotificationApi {
  return {
    async getNotificationList() { return initialList(); },
    async getUnreadCount() { return { unreadCount: 1 }; },
    async markNotificationRead(id) { return { item: { ...item, id, readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 }; },
    async markAllNotificationsRead() { return { updatedCount: 1, unreadCount: 0 }; },
    ...overrides,
  };
}

export async function runNotificationClientTests(check: Check): Promise<void> {
  await check("클라이언트: 네 API가 정확한 경로와 인증 헤더·쿠키·no-store를 사용한다", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const responses = [
      { items: [item], unreadCount: 1, limit: 100 },
      { unreadCount: 1 },
      { item: { ...item, readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 },
      { updatedCount: 1, unreadCount: 0 },
    ];
    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse(responses[requests.length - 1]);
    };
    const api = createNotificationHttpApi({ getAccessToken: async () => "synthetic-client-token", fetch: fakeFetch });
    assert.equal((await api.getNotificationList()).items[0].id, item.id);
    assert.equal((await api.getUnreadCount()).unreadCount, 1);
    assert.equal((await api.markNotificationRead(item.id)).item.readAt, "2026-09-07T03:05:00.000Z");
    assert.equal((await api.markAllNotificationsRead()).updatedCount, 1);
    assert.deepEqual(requests.map((request) => request.url), [
      "/api/v1/notifications",
      "/api/v1/notifications/unread-count",
      `/api/v1/notifications/${item.id}/read`,
      "/api/v1/notifications/read-all",
    ]);
    assert.deepEqual(requests.map(({ init }) => init?.method ?? "GET"), ["GET", "GET", "POST", "POST"]);
    for (const { init } of requests) {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-client-token");
      assert.equal(init?.credentials, "include");
      assert.equal(init?.cache, "no-store");
      assert.equal(new URLSearchParams(String(init?.body ?? "")).has("recipientId"), false);
    }
  });

  await check("클라이언트: 토큰은 요청마다 다시 읽고 없는 토큰은 네트워크 전에 거부한다", async () => {
    let token: string | null = "synthetic-first-token";
    const authorizations: (string | null)[] = [];
    const fakeFetch: typeof globalThis.fetch = async (_input, init) => {
      authorizations.push(new Headers(init?.headers).get("Authorization"));
      return jsonResponse({ unreadCount: 0 });
    };
    const api = createNotificationHttpApi({ getAccessToken: () => token, fetch: fakeFetch });
    await api.getUnreadCount();
    token = "synthetic-second-token";
    await api.getUnreadCount();
    token = null;
    await assert.rejects(api.getNotificationList(), isApiError(401));
    await assert.rejects(api.getUnreadCount(), isApiError(401));
    await assert.rejects(api.markNotificationRead(item.id), isApiError(401));
    await assert.rejects(api.markAllNotificationsRead(), isApiError(401));
    assert.deepEqual(authorizations, ["Bearer synthetic-first-token", "Bearer synthetic-second-token"]);
  });

  await check("클라이언트: 인증 실패와 서버 오류를 성공 DTO로 처리하지 않는다", async () => {
    for (const status of [401, 404, 500]) {
      const api = httpWithResponse({ error: { code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", message: "요청 실패" } }, status);
      await assert.rejects(api.getNotificationList(), isApiError(status));
    }
  });

  await check("클라이언트: HTML·깨진 JSON은 목록 성공으로 처리하지 않는다", async () => {
    for (const raw of ["<!doctype html><title>배포 안내</title>", "{not-json"]) {
      const fakeFetch: typeof globalThis.fetch = async () => new Response(raw, { status: 200 });
      const api = createNotificationHttpApi({ getAccessToken: () => "synthetic-client-token", fetch: fakeFetch });
      await assert.rejects(api.getNotificationList(), NotificationApiError);
    }
  });

  await check("클라이언트: 정상 DTO라도 계약에 없는 201·202 상태를 완료로 받아들이지 않는다", async () => {
    for (const status of [201, 202]) {
      await assert.rejects(httpWithResponse(initialList(), status).getNotificationList(), NotificationApiError);
      await assert.rejects(httpWithResponse({ unreadCount: 1 }, status).getUnreadCount(), NotificationApiError);
      await assert.rejects(httpWithResponse({ item: { ...item, readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 }, status).markNotificationRead(item.id), NotificationApiError);
      await assert.rejects(httpWithResponse({ updatedCount: 1, unreadCount: 0 }, status).markAllNotificationsRead(), NotificationApiError);
    }
  });

  await check("클라이언트: 필수 목록 필드와 미읽음 수의 형식을 검증한다", async () => {
    for (const invalid of [
      null, {}, { items: null, unreadCount: 0, limit: 100 },
      { items: [], unreadCount: -1, limit: 100 },
      { items: [], unreadCount: 1.5, limit: 100 },
      { items: [], unreadCount: "1", limit: 100 },
      { items: [], unreadCount: 0, limit: 101 },
    ]) {
      await assert.rejects(httpWithResponse(invalid).getNotificationList(), NotificationApiError);
    }
  });

  await check("클라이언트: 내부 필드를 응답 DTO에서 제거하고 전체 미읽음 수는 유지한다", async () => {
    const api = httpWithResponse({
      items: [{ ...item, recipientId: "private_recipient", dedupeKey: "private_dedupe" }],
      unreadCount: 147, limit: 100, internalDebug: "private_debug",
    });
    const response = await api.getNotificationList();
    assert.equal(response.unreadCount, 147);
    assert.equal("internalDebug" in response, false);
    assert.equal("recipientId" in response.items[0], false);
    assert.equal("dedupeKey" in response.items[0], false);
    assert.deepEqual(response.items[0], item);
  });

  await check("클라이언트: 목록 상한·중복 ID·표시 미읽음보다 작은 전체 개수를 거부한다", async () => {
    for (const invalid of [
      { items: [item, item], unreadCount: 2, limit: 100 },
      { items: [item], unreadCount: 0, limit: 100 },
      { items: Array.from({ length: 101 }, (_, index) => ({ ...item, id: `ntf_many_${index}` })), unreadCount: 101, limit: 100 },
    ]) {
      await assert.rejects(httpWithResponse(invalid).getNotificationList(), NotificationApiError);
    }
  });

  await check("클라이언트: 생성 대상이 아닌 정본 알림 종류도 목록에서는 호환한다", async () => {
    const response = await httpWithResponse({
      items: [{ ...item, type: "REVIEW_REQUESTED", resourceType: null, resourceId: null }],
      unreadCount: 1, limit: 100,
    }).getNotificationList();
    assert.equal(response.items[0].type, "REVIEW_REQUESTED");
    assert.equal(response.items[0].resourceType, null);
    assert.equal(response.items[0].resourceId, null);
  });

  await check("클라이언트: 외부·프로토콜 상대·인코딩된 우회 링크를 알림으로 소비하지 않는다", async () => {
    for (const linkUrl of [
      "https://example.com/projects/prj_client_test001", "//example.com/projects/prj_client_test001",
      "javascript:alert(1)", "/\\example.com", "/projects/../login",
      "/projects/%2e%2e", "/projects/prj_client_test001?next=https://example.com",
      "/projects/prj_client_test001#fragment", "/projects/prj_client_test001\n",
    ]) {
      await assert.rejects(
        httpWithResponse({ items: [{ ...item, linkUrl }], unreadCount: 1, limit: 100 }).getNotificationList(),
        NotificationApiError,
      );
    }
  });

  await check("클라이언트: 알림 종류·식별자·시각이 잘못되면 전체 응답을 거부한다", async () => {
    for (const invalid of [
      { ...item, type: "REVIEW_CREATED" }, { ...item, id: "../read-all" },
      { ...item, createdAt: "invalid-time" }, { ...item, readAt: "invalid-time" },
    ]) {
      await assert.rejects(
        httpWithResponse({ items: [invalid], unreadCount: 1, limit: 100 }).getNotificationList(),
        NotificationApiError,
      );
    }
  });

  await check("클라이언트: 개별 읽음 응답은 요청한 알림 ID와 일치해야 한다", async () => {
    const api = httpWithResponse({ item: { ...item, id: "ntf_other", readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 });
    await assert.rejects(api.markNotificationRead(item.id), NotificationApiError);
  });

  await check("클라이언트: 읽음 API에도 안전한 프로젝트 링크 검증을 적용한다", async () => {
    const api = httpWithResponse({ item: { ...item, linkUrl: "https://example.com", readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 });
    await assert.rejects(api.markNotificationRead(item.id), NotificationApiError);
  });

  await check("클라이언트: 읽음 수 응답의 음수·소수 값을 거부한다", async () => {
    await assert.rejects(httpWithResponse({ unreadCount: -1 }).getUnreadCount(), NotificationApiError);
    await assert.rejects(httpWithResponse({ updatedCount: -1, unreadCount: 0 }).markAllNotificationsRead(), NotificationApiError);
    await assert.rejects(httpWithResponse({ updatedCount: 1, unreadCount: 0.5 }).markAllNotificationsRead(), NotificationApiError);
  });

  await check("클라이언트: 개별 읽음 요청의 잘못된 ID는 fetch 전에 거부한다", async () => {
    let calls = 0;
    const fakeFetch: typeof globalThis.fetch = async () => { calls += 1; return jsonResponse({}); };
    const api = createNotificationHttpApi({ getAccessToken: () => "synthetic-client-token", fetch: fakeFetch });
    for (const id of ["", "../read-all", "id/other", "id?recipientId=other", "x".repeat(31)]) {
      await assert.rejects(async () => api.markNotificationRead(id), NotificationApiError);
    }
    assert.equal(calls, 0);
  });

  await check("Mock 클라이언트: 인스턴스 간 읽음 상태와 반환 객체를 공유하지 않는다", async () => {
    const first = createNotificationApiMock({ scenario: "client", delayMs: 0 });
    const second = createNotificationApiMock({ scenario: "client", delayMs: 0 });
    const initial = await first.getNotificationList();
    assert.ok(initial.items.length > 0);
    const originalTitle = initial.items[0].title;
    initial.items[0].title = "반환 사본만 수정";
    initial.items.length = 0;
    assert.equal((await first.getNotificationList()).items[0].title, originalTitle);
    const unreadBefore = (await second.getUnreadCount()).unreadCount;
    assert.ok(unreadBefore > 0);
    await first.markAllNotificationsRead();
    assert.equal((await first.getUnreadCount()).unreadCount, 0);
    assert.equal((await second.getUnreadCount()).unreadCount, unreadBefore);
  });

  await check("Mock 클라이언트: 반복 읽음은 최초 시각을 보존한다", async () => {
    const api = createNotificationApiMock({ scenario: "freelancer", delayMs: 0 });
    const unread = (await api.getNotificationList()).items.find((notification) => notification.readAt === null);
    assert.ok(unread);
    const first = await api.markNotificationRead(unread.id);
    const repeated = await api.markNotificationRead(unread.id);
    assert.ok(first.item.readAt);
    assert.equal(repeated.item.readAt, first.item.readAt);
    assert.equal(repeated.unreadCount, first.unreadCount);
  });

  await check("Mock 클라이언트: 빈 목록·세션 만료·서버 실패를 별도 상태로 제공한다", async () => {
    assert.deepEqual(await createNotificationApiMock({ scenario: "empty", delayMs: 0 }).getNotificationList(), {
      items: [], unreadCount: 0, limit: 100,
    });
    await assert.rejects(createNotificationApiMock({ scenario: "session", delayMs: 0 }).getNotificationList(), isApiError(401));
    await assert.rejects(createNotificationApiMock({ scenario: "error", delayMs: 0 }).getNotificationList(), isApiError(500));
  });

  await check("세션 상태: 인증 주체가 없으면 초기 자료도 숨기고 API를 호출하지 않는다", async () => {
    let calls = 0;
    const api = stubApi({ async getNotificationList() { calls++; return initialList(); } });
    const store = createNotificationStore(api, null, initialList());
    assert.deepEqual(store.getSnapshot().items, []);
    assert.equal(store.getSnapshot().status, "session-expired");
    assert.equal(store.getSnapshot().unreadCount, null);
    await store.start();
    await store.refresh();
    await store.markRead(item.id);
    await store.markAllRead();
    assert.equal(calls, 0);
  });

  await check("세션 상태: 401은 이전 목록·개수·읽음 보정을 제거하고 같은 세션 재호출을 막는다", async () => {
    let expired = false;
    let calls = 0;
    const api = stubApi({ async getNotificationList() {
      calls++;
      if (expired) throw new NotificationApiError(401, "UNAUTHORIZED", "세션 만료");
      return initialList();
    } });
    const store = createNotificationStore(api, "session-first");
    await store.start();
    assert.equal(store.getSnapshot().items.length, 1);
    expired = true;
    await store.refresh();
    const state = store.getSnapshot();
    assert.deepEqual(state.items, []);
    assert.deepEqual(state.confirmedReadIds, []);
    assert.equal(state.unreadCount, null);
    assert.equal(state.hasLoaded, false);
    assert.equal(state.status, "session-expired");
    assert.equal(state.isRefreshing, false);
    await store.refresh();
    assert.equal(calls, 2);
  });

  await check("세션 상태: 500 새로고침 실패는 확인된 목록을 보존하고 재시도할 수 있다", async () => {
    let failed = false;
    const api = stubApi({ async getNotificationList() {
      if (failed) throw new NotificationApiError(500, "INTERNAL_ERROR", "다시 시도해 주세요.");
      return initialList();
    } });
    const store = createNotificationStore(api, "session-first");
    await store.start();
    failed = true;
    await store.refresh();
    assert.deepEqual(store.getSnapshot().items, initialList().items);
    assert.equal(store.getSnapshot().unreadCount, 1);
    assert.equal(store.getSnapshot().status, "ready");
    assert.ok(store.getSnapshot().errorMessage);
    failed = false;
    await store.refresh();
    assert.equal(store.getSnapshot().errorMessage, null);
  });

  await check("세션 상태: 개별·전체 읽음의 401도 이전 자료와 pending 상태를 제거한다", async () => {
    for (const mutation of ["read", "all"] as const) {
      const rejected = async (): Promise<never> => { throw new NotificationApiError(401, "UNAUTHORIZED", "세션 만료"); };
      const store = createNotificationStore(stubApi({
        markNotificationRead: rejected,
        markAllNotificationsRead: rejected,
      }), "session-first", initialList());
      if (mutation === "read") await store.markRead(item.id);
      else await store.markAllRead();
      const state = store.getSnapshot();
      assert.equal(state.status, "session-expired");
      assert.deepEqual(state.items, []);
      assert.equal(state.unreadCount, null);
      assert.equal(state.pendingNotificationId, null);
      assert.equal(state.isMarkingAllRead, false);
    }
  });

  await check("세션 상태: 읽음 저장 실패는 읽음 시각·미읽음 수를 바꾸지 않는다", async () => {
    const store = createNotificationStore(stubApi({ async markNotificationRead() {
      throw new NotificationApiError(500, "INTERNAL_ERROR", "읽음 처리 실패");
    } }), "session-first", initialList());
    await store.markRead(item.id);
    assert.equal(store.getSnapshot().items[0].readAt, null);
    assert.equal(store.getSnapshot().unreadCount, 1);
    assert.equal(store.getSnapshot().pendingNotificationId, null);
    assert.ok(store.getSnapshot().errorMessage);
  });

  await check("세션 상태: 폐기한 요청의 늦은 성공·401은 새 계정 상태에 영향을 주지 않는다", async () => {
    for (const fails of [false, true]) {
      const oldResponse = pending<NotificationListResponse>();
      const oldStore = createNotificationStore(stubApi({ getNotificationList: () => oldResponse.promise }), "old-session");
      const oldRequest = oldStore.start();
      oldStore.dispose();
      const disposed = oldStore.getSnapshot();
      const newItem = { ...item, id: "ntf_new_session", title: "새 계정의 알림" };
      const newStore = createNotificationStore(stubApi({ async getNotificationList() {
        return { items: [newItem], unreadCount: 1, limit: 100 };
      } }), "new-session");
      assert.deepEqual(newStore.getSnapshot().items, []);
      await newStore.start();
      if (fails) oldResponse.reject(new NotificationApiError(401, "UNAUTHORIZED", "이전 세션 만료"));
      else oldResponse.resolve(initialList());
      await oldRequest;
      assert.equal(oldStore.getSnapshot(), disposed);
      assert.equal(newStore.getSnapshot().status, "ready");
      assert.deepEqual(newStore.getSnapshot().items, [newItem]);
    }
  });

  await check("세션 상태: StrictMode 재시작에서 이전 세대 응답이 최신 요청을 덮지 않는다", async () => {
    const first = pending<NotificationListResponse>();
    const second = pending<NotificationListResponse>();
    let calls = 0;
    const store = createNotificationStore(stubApi({ getNotificationList() {
      calls++;
      return calls === 1 ? first.promise : second.promise;
    } }), "same-session");
    const oldRequest = store.start();
    store.dispose();
    const currentRequest = store.start();
    const currentItem = { ...item, id: "ntf_current_request" };
    second.resolve({ items: [currentItem], unreadCount: 1, limit: 100 });
    await currentRequest;
    first.resolve(initialList());
    await oldRequest;
    assert.equal(calls, 2);
    assert.deepEqual(store.getSnapshot().items, [currentItem]);
    assert.equal(store.getSnapshot().isRefreshing, false);
  });

  await check("세션 상태: 개별 읽음 중 중복 읽음·전체 읽음·새로고침을 직렬로 제한한다", async () => {
    const response = pending<ReadNotificationResponse>();
    let readCalls = 0;
    let allCalls = 0;
    let listCalls = 0;
    const api = stubApi({
      markNotificationRead() { readCalls++; return response.promise; },
      async markAllNotificationsRead() { allCalls++; return { updatedCount: 1, unreadCount: 0 }; },
      async getNotificationList() { listCalls++; return initialList(); },
    });
    const store = createNotificationStore(api, "session-first", initialList());
    const operation = store.markRead(item.id);
    assert.equal(store.getSnapshot().pendingNotificationId, item.id);
    await store.markRead(item.id);
    await store.markAllRead();
    await store.refresh();
    assert.deepEqual([readCalls, allCalls, listCalls], [1, 0, 0]);
    response.resolve({ item: { ...item, readAt: "2026-09-07T03:05:00.000Z" }, unreadCount: 0 });
    await operation;
    assert.equal(store.getSnapshot().pendingNotificationId, null);
    assert.equal(store.getSnapshot().unreadCount, 0);
    assert.equal(store.getSnapshot().items[0].readAt, "2026-09-07T03:05:00.000Z");
  });

  await check("세션 상태: 전체 읽음 뒤 재조회 실패는 성공 사실을 유지하되 읽음 시각을 만들지 않는다", async () => {
    const store = createNotificationStore(stubApi({ async getNotificationList() {
      throw new NotificationApiError(500, "INTERNAL_ERROR", "목록 새로고침 실패");
    } }), "session-first", initialList());
    await store.markAllRead();
    const state = store.getSnapshot();
    assert.equal(state.unreadCount, 0);
    assert.equal(state.items[0].readAt, null);
    assert.deepEqual(state.confirmedReadIds, [item.id]);
    assert.equal(state.isMarkingAllRead, false);
    assert.ok(state.message.includes("1"));
    assert.ok(state.errorMessage);
  });

  await check("세션 상태: 전체 읽음 이후 도착한 알림은 다시 미읽음으로 표시한다", async () => {
    const arrived = { ...item, id: "ntf_arrived_later", createdAt: "2026-09-07T03:06:00.000Z" };
    const original = { ...item, readAt: "2026-09-07T03:05:00.000Z" };
    const store = createNotificationStore(stubApi({ async getNotificationList() {
      return { items: [arrived, original], unreadCount: 1, limit: 100 };
    } }), "session-first", initialList());
    await store.markAllRead();
    assert.deepEqual(store.getSnapshot().confirmedReadIds, []);
    assert.equal(store.getSnapshot().unreadCount, 1);
    assert.equal(store.getSnapshot().items[0].id, arrived.id);
    assert.equal(store.getSnapshot().items[0].readAt, null);
    assert.equal(store.getSnapshot().items[1].readAt, original.readAt);
  });
}
