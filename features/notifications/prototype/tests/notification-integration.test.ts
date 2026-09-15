import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { createNotificationModule } from "../server/notification.module";
import type { NotificationEventInput } from "../server/notification.types";
import { InMemoryNotificationRepository } from "../mock/notification-repository.mock";
import { createNotificationHttpApi, NotificationApiError } from "../web/api/notifications";
import { createNotificationStore } from "../web/notification.store";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const now = "2026-09-08T05:00:00.000Z";
const base = { eventId: "evt_submit", projectId: "prj_integration", projectTitle: "연동 검증", occurredAt: now };
const submitted: NotificationEventInput = {
  ...base, type: "APPLICATION_SUBMITTED", applicationId: "apl_integration", clientId: "usr_client",
};
const hasStatus = (status: number) => (error: unknown) => error instanceof NotificationApiError && error.status === status;

/** 실제 외부 계정/DB가 아닌 loopback HTTP + 명시적 테스트 인증 resolver다. */
async function withModule(run: (fixture: {
  repository: InMemoryNotificationRepository;
  module: ReturnType<typeof createNotificationModule>;
  origin: string;
  api: ReturnType<typeof createNotificationHttpApi>;
  otherApi: ReturnType<typeof createNotificationHttpApi>;
}) => Promise<void>) {
  const repository = new InMemoryNotificationRepository();
  const module = createNotificationModule({ repository, clock: () => now, resolveAuth: (request) => {
    if (request.headers.authorization === "Bearer integration-client") return { userId: "usr_client", isActive: true };
    if (request.headers.authorization === "Bearer integration-freelancer") return { userId: "usr_freelancer", isActive: true };
    return null;
  } });
  const app = express();
  // 전체 경로를 가진 알림 router를 전역 JSON parser보다 먼저 조립한다.
  app.use(module.router);
  app.use(express.json());
  app.get("/unrelated", (_request, response) => response.json({ untouched: true }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const api = createNotificationHttpApi({ baseUrl: `${origin}/api/v1/notifications`, getAccessToken: () => "integration-client" });
    const otherApi = createNotificationHttpApi({ baseUrl: `${origin}/api/v1/notifications`, getAccessToken: () => "integration-freelancer" });
    await run({ repository, module, origin, api, otherApi });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

export async function runNotificationIntegrationTests(check: Check) {
  await check("통합 규칙 19: 인증 resolver 없는 조립을 허용하지 않는다", () => {
    assert.throws(() => createNotificationModule({ repository: new InMemoryNotificationRepository(), resolveAuth: undefined! }));
  });
  await check("통합 규칙 19: 생성 포트→HTTP API 4종→실제 클라이언트가 같은 저장 상태를 사용한다", async () => {
    await withModule(async ({ module, api, otherApi, repository }) => {
      const { deliverNotificationEventSafely } = module.delivery;
      assert.deepEqual(await deliverNotificationEventSafely(submitted), { status: "delivered", createdCount: 1, duplicateCount: 0 });
      await deliverNotificationEventSafely({ ...submitted, eventId: "evt_submit_again" });
      const list = await api.getNotificationList();
      assert.equal(list.items.length, 2);
      assert.equal(list.unreadCount, 2);
      assert.ok(!("recipientId" in list.items[0]) && !("dedupeKey" in list.items[0]));
      assert.deepEqual(await api.getUnreadCount(), { unreadCount: 2 });
      assert.deepEqual(await otherApi.getNotificationList(), { items: [], unreadCount: 0, limit: 100 });
      await assert.rejects(otherApi.markNotificationRead(list.items[0].id), hasStatus(404));
      const read = await api.markNotificationRead(list.items[0].id);
      assert.equal(read.item.readAt, now);
      assert.equal(read.unreadCount, 1);
      assert.deepEqual(await api.markNotificationRead(list.items[0].id), read);
      assert.deepEqual(await api.markAllNotificationsRead(), { updatedCount: 1, unreadCount: 0 });
      assert.deepEqual(await api.markAllNotificationsRead(), { updatedCount: 0, unreadCount: 0 });
      assert.equal(repository.snapshot().length, 2);
      assert.ok((await api.getNotificationList()).items.every(entry => entry.readAt === now));
    });
  });
  await check("통합 규칙 5–14: 정규화된 필수 6종을 재전달해도 수신자별 한 번만 조회된다", async () => {
    await withModule(async ({ module, api, otherApi }) => {
      const events: NotificationEventInput[] = [submitted,
        ...(["APPLICATION_ACCEPTED", "APPLICATION_REJECTED", "APPLICATION_AUTO_REJECTED"] as const).map(type => ({
          ...base, type, eventId: `evt_${type}`, applicationId: "apl_integration", freelancerId: "usr_freelancer",
        })),
        { ...base, type: "PROJECT_RECRUITMENT_CLOSED", closureEventId: "close_round_1", recipientIds: ["usr_freelancer", "usr_freelancer"] },
        { ...base, type: "PROJECT_CANCELED", closureEventId: "cancel_round_1", pendingFreelancerIds: ["usr_freelancer"], acceptedFreelancerId: "usr_freelancer" },
      ];
      for (const event of events) {
        assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 1, duplicateCount: 0 });
        assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 0, duplicateCount: 1 });
      }
      assert.equal((await api.getUnreadCount()).unreadCount, 1);
      const list = await otherApi.getNotificationList();
      assert.equal(list.unreadCount, 5);
      assert.equal(new Set(list.items.map(entry => entry.type)).size, 5);
      assert.ok(list.items.every(entry => entry.createdAt === now && entry.linkUrl === "/projects/prj_integration"));
      // 원천 applications의 축약 이벤트를 임의 보강하거나 성공으로 ACK하지 않는다.
      assert.deepEqual(await module.delivery.deliverNotificationEventSafely({ type: "APPLICATION_SUBMITTED", projectId: base.projectId,
        applicationId: "apl_integration", occurredAt: now } as NotificationEventInput), { status: "retry_required" });
    });
  });
  await check("통합 규칙 13·18: 부분 저장 실패 후 같은 마감 사건 재전달로만 전달 완료된다", async () => {
    await withModule(async ({ repository, module, api, otherApi }) => {
      const event: NotificationEventInput = { ...base, type: "PROJECT_RECRUITMENT_CLOSED", closureEventId: "closure_stable",
        recipientIds: ["usr_client", "usr_freelancer"] };
      repository.failNextInsert(1);
      assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "retry_required" });
      assert.equal((await api.getUnreadCount()).unreadCount, 1);
      assert.equal((await otherApi.getUnreadCount()).unreadCount, 0);
      assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 1, duplicateCount: 1 });
      assert.equal((await otherApi.getUnreadCount()).unreadCount, 1);
      assert.equal(repository.snapshot().length, 2);
      // 실제 worker ACK/deadlineNotifiedAt/10분 SLA는 이 fixture에 없다.
    });
  });
  await check("통합 규칙 1·19: 전역 파서 전 조립으로 인증 우선·비공개 생성·독립 경로를 유지한다", async () => {
    await withModule(async ({ origin, repository }) => {
      for (const authorized of [false, true]) {
        const response = await fetch(`${origin}/api/v1/notifications/read-all`, { method: "POST",
          headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer integration-client" } : {}) }, body: "{invalid" });
        assert.equal(response.status, authorized ? 400 : 401);
        assert.equal(response.headers.get("cache-control"), "no-store");
      }
      const noPublicCreate = await fetch(`${origin}/api/v1/notifications`, { method: "POST",
        headers: { Authorization: "Bearer integration-client", "Content-Type": "application/json" }, body: JSON.stringify(submitted) });
      assert.equal(noPublicCreate.status, 404);
      assert.equal(repository.snapshot().length, 0);
      assert.deepEqual(await (await fetch(`${origin}/unrelated`)).json(), { untouched: true });
    });
  });
  await check("통합 규칙 16: 실제 HTTP 읽음 뒤 store와 배지용 snapshot이 갱신되고 401에 숨겨진다", async () => {
    await withModule(async ({ module, origin }) => {
      await module.delivery.deliverNotificationEventSafely(submitted);
      let accessToken = "integration-client";
      const api = createNotificationHttpApi({ baseUrl: `${origin}/api/v1/notifications`, getAccessToken: () => accessToken });
      const store = createNotificationStore(api, "integration-session");
      try {
        await store.start();
        assert.equal(store.getSnapshot().unreadCount, 1);
        await store.markRead(store.getSnapshot().items[0].id);
        assert.equal(store.getSnapshot().unreadCount, 0);
        accessToken = "expired-fixture";
        await store.refresh();
        assert.equal(store.getSnapshot().status, "session-expired");
        assert.deepEqual(store.getSnapshot().items, []);
        assert.equal(store.getSnapshot().unreadCount, null);
      } finally { store.dispose(); }
    });
  });
}
