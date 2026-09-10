import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { InMemoryNotificationRepository } from "../mock/notification-repository.mock";
import { createNotificationModule } from "../server/notification.module";
import { NotificationApiError as ServerError, NotificationService } from "../server/notification.service";
import type { NotificationEventInput, NotificationItem, NotificationRecord } from "../server/notification.types";
import { createNotificationApi, createNotificationHttpApi, NotificationApiError as ClientError } from "../web/api/notifications";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const now = "2026-09-10T05:00:00.000Z";
const ID_LENGTHS = [1, 30, 31, 36, 38, 40];
const invalidIds = ["", "x".repeat(41), " id", "id ", "id space", "id/part", "id\\part",
  "id?query", "id#fragment", "id%2Fpart", "https://example.test", "id\n", "id\r", "id\u2028"];
const identifier = (length: number, prefix: string) => prefix.slice(0, length).padEnd(length, "a");
const serverError = (status: number) => (error: unknown) => error instanceof ServerError && error.status === status;
const clientError = (status: number) => (error: unknown) => error instanceof ClientError && error.status === status;

function notification(length = 1): NotificationRecord {
  return {
    id: identifier(length, "ntf_"), recipientId: identifier(length, "usr_client_"),
    dedupeKey: `seed:${length}`, type: "APPLICATION_SUBMITTED", title: "새로운 지원", body: "지원 내용을 확인해 주세요.",
    linkUrl: `/projects/${identifier(length, "prj_")}`, resourceType: "application", resourceId: identifier(length, "app_"),
    readAt: null, createdAt: now,
  };
}

function publicNotification(record: NotificationRecord): NotificationItem {
  const { recipientId: _recipientId, dedupeKey: _dedupeKey, ...dto } = record;
  return dto;
}

function submitted(length = 1): NotificationEventInput {
  return {
    type: "APPLICATION_SUBMITTED", eventId: `evt_submit_${length}`, projectId: identifier(length, "prj_"),
    projectTitle: "ID 호환성 검증", occurredAt: now,
    applicationId: identifier(length, "app_"), clientId: identifier(length, "usr_client_"),
  };
}

function events(length: number): NotificationEventInput[] {
  const base = { projectId: identifier(length, "prj_"), projectTitle: "ID 호환성 검증", occurredAt: now };
  const freelancerId = identifier(length, "usr_freelancer_");
  return [
    submitted(length),
    ...(["APPLICATION_ACCEPTED", "APPLICATION_REJECTED", "APPLICATION_AUTO_REJECTED"] as const).map(type => ({
      ...base, type, eventId: `evt_${type}`, applicationId: identifier(length, "app_"), freelancerId,
    })),
    { ...base, type: "PROJECT_RECRUITMENT_CLOSED", eventId: "evt_closed", closureEventId: "closure:closed",
      recipientIds: [freelancerId, freelancerId] },
    { ...base, type: "PROJECT_CANCELED", eventId: "evt_canceled", closureEventId: "closure:canceled",
      pendingFreelancerIds: [freelancerId], acceptedFreelancerId: freelancerId },
  ];
}

function apiWithResponse(response: unknown) {
  return createNotificationApi({ request: async () => response });
}

/** 외부 서비스/계정/DB 없이 명시적 가상 인증과 휘발성 저장소만 사용한다. */
async function withHttpFixture(length: number, run: (fixture: {
  repository: InMemoryNotificationRepository;
  module: ReturnType<typeof createNotificationModule>;
  clientApi: ReturnType<typeof createNotificationHttpApi>;
  freelancerApi: ReturnType<typeof createNotificationHttpApi>;
  observedStatuses: number[];
}) => Promise<void>): Promise<void> {
  const repository = new InMemoryNotificationRepository([notification(length)]);
  const module = createNotificationModule({ repository, clock: () => now, resolveAuth: request => {
    if (request.headers.authorization === "Bearer synthetic-client") {
      return { userId: identifier(length, "usr_client_"), isActive: true };
    }
    if (request.headers.authorization === "Bearer synthetic-freelancer") {
      return { userId: identifier(length, "usr_freelancer_"), isActive: true };
    }
    return null;
  } });
  const app = express();
  app.use(module.router);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/notifications`;
    const observedStatuses: number[] = [];
    const observedFetch: typeof globalThis.fetch = async (input, init) => {
      const response = await fetch(input, init);
      observedStatuses.push(response.status);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response;
    };
    const clientApi = createNotificationHttpApi({ baseUrl, fetch: observedFetch, getAccessToken: () => "synthetic-client" });
    const freelancerApi = createNotificationHttpApi({ baseUrl, fetch: observedFetch, getAccessToken: () => "synthetic-freelancer" });
    await run({ repository, module, clientApi, freelancerApi, observedStatuses });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

export async function runNotificationIdCompatibilityTests(check: Check): Promise<void> {
  for (const length of ID_LENGTHS) {
    await check(`ID 호환 서버: ${length}자 인증·사건·저장 DTO·개별 읽음을 수용한다`, async () => {
      const seed = notification(length);
      const repository = new InMemoryNotificationRepository([seed]);
      const service = new NotificationService(repository, () => now);
      const auth = { userId: seed.recipientId, isActive: true };
      assert.deepEqual(await service.getNotificationList(auth), { items: [publicNotification(seed)], unreadCount: 1, limit: 100 });
      assert.deepEqual(await service.getUnreadCount(auth), { unreadCount: 1 });
      const read = await service.markNotificationRead(auth, seed.id);
      assert.deepEqual(read, { item: { ...publicNotification(seed), readAt: now }, unreadCount: 0 });
      assert.deepEqual(await service.markNotificationRead(auth, seed.id), read);
      assert.deepEqual(await service.deliverNotificationEventSafely(submitted(length)), { status: "delivered", createdCount: 1, duplicateCount: 0 });
      assert.deepEqual(await service.deliverNotificationEventSafely(submitted(length)), { status: "delivered", createdCount: 0, duplicateCount: 1 });
      const list = await service.getNotificationList(auth);
      assert.equal(list.items.length, 2);
      assert.equal(list.unreadCount, 1);
      assert.ok(list.items.every(row => row.resourceId === seed.resourceId && row.linkUrl === seed.linkUrl));
      assert.deepEqual(await service.markAllNotificationsRead(auth), { updatedCount: 1, unreadCount: 0 });
    });
    await check(`ID 호환 웹: ${length}자 알림·리소스·프로젝트 링크를 조회와 읽음에서 수용한다`, async () => {
      const dto = publicNotification(notification(length));
      const paths: string[] = [];
      const api = createNotificationApi({ request: async (path, { method }) => {
        paths.push(path);
        return method === "GET" ? { items: [dto], unreadCount: 1, limit: 100 }
          : { item: { ...dto, readAt: now }, unreadCount: 0 };
      } });
      assert.deepEqual(await api.getNotificationList(), { items: [dto], unreadCount: 1, limit: 100 });
      assert.deepEqual(await api.markNotificationRead(dto.id), { item: { ...dto, readAt: now }, unreadCount: 0 });
      assert.deepEqual(paths, ["/api/v1/notifications", `/api/v1/notifications/${dto.id}/read`]);
    });
  }

  await check("ID 호환 서버 경계: 41자·경로/URL 문자·공백·후행 개행을 저장 전에 거부한다", async () => {
    const repository = new InMemoryNotificationRepository();
    const service = new NotificationService(repository, () => now);
    for (const id of invalidIds) {
      await assert.rejects(service.getNotificationList({ userId: id, isActive: true }), serverError(401));
      await assert.rejects(service.markNotificationRead({ userId: "usr_valid", isActive: true }, id), serverError(400));
      for (const patch of [{ projectId: id }, { applicationId: id }, { clientId: id }]) {
        await assert.rejects(service.publishEvent({ ...submitted(), ...patch } as NotificationEventInput), serverError(400));
      }
      for (const event of [
        { type: "APPLICATION_ACCEPTED", eventId: "evt_accept", projectId: "prj_valid", projectTitle: "검증", occurredAt: now,
          applicationId: "app_valid", freelancerId: id },
        { type: "PROJECT_RECRUITMENT_CLOSED", eventId: "evt_close", projectId: "prj_valid", projectTitle: "검증", occurredAt: now,
          closureEventId: "closure_valid", recipientIds: ["usr_valid", id] },
        { type: "PROJECT_CANCELED", eventId: "evt_cancel", projectId: "prj_valid", projectTitle: "검증", occurredAt: now,
          closureEventId: "closure_valid", pendingFreelancerIds: ["usr_valid", id], acceptedFreelancerId: null },
        { type: "PROJECT_CANCELED", eventId: "evt_cancel", projectId: "prj_valid", projectTitle: "검증", occurredAt: now,
          closureEventId: "closure_valid", pendingFreelancerIds: ["usr_valid"], acceptedFreelancerId: id },
      ]) {
        await assert.rejects(service.publishEvent(event as NotificationEventInput), serverError(400));
      }
    }
    assert.deepEqual(repository.snapshot(), []);
  });

  await check("ID 호환 응답 경계: 잘못된 저장 ID·리소스·링크는 서버 500과 웹 502로 거부한다", async () => {
    for (const id of invalidIds) {
      for (const patch of [{ id }, { resourceId: id }, { linkUrl: `/projects/${id}` }]) {
        const seed = { ...notification(), ...patch };
        const service = new NotificationService(new InMemoryNotificationRepository([seed]), () => now);
        await assert.rejects(service.getNotificationList({ userId: seed.recipientId, isActive: true }), serverError(500));
        const dto = publicNotification(seed);
        await assert.rejects(apiWithResponse({ items: [dto], unreadCount: 1, limit: 100 }).getNotificationList(), clientError(502));
        if (!("id" in patch)) {
          await assert.rejects(apiWithResponse({ item: { ...dto, readAt: now }, unreadCount: 0 }).markNotificationRead(dto.id), clientError(502));
        }
      }
    }
    let calls = 0;
    const api = createNotificationApi({ request: async () => { calls++; return {}; } });
    for (const id of invalidIds) await assert.rejects(api.markNotificationRead(id), clientError(400));
    assert.equal(calls, 0);
  });

  await check("ID 호환 비확장 경계: resourceType은 null/30자만 유지하고 31자는 거부한다", async () => {
    for (const resourceType of [null, "r".repeat(30)]) {
      const seed = { ...notification(), resourceType };
      const service = new NotificationService(new InMemoryNotificationRepository([seed]), () => now);
      const list = await service.getNotificationList({ userId: seed.recipientId, isActive: true });
      assert.equal(list.items[0].resourceType, resourceType);
      assert.deepEqual(await apiWithResponse(list).getNotificationList(), list);
    }
    const seed = { ...notification(), resourceType: "r".repeat(31) };
    const service = new NotificationService(new InMemoryNotificationRepository([seed]), () => now);
    await assert.rejects(service.getNotificationList({ userId: seed.recipientId, isActive: true }), serverError(500));
    await assert.rejects(apiWithResponse({ items: [publicNotification(seed)], unreadCount: 1, limit: 100 }).getNotificationList(), clientError(502));
  });

  await check("ID 호환 비확장 경계: eventId·closureEventId는 120자 수용과 121자 거부를 유지한다", async () => {
    const repository = new InMemoryNotificationRepository();
    const service = new NotificationService(repository, () => now);
    const input = { ...submitted(), eventId: "e".repeat(120) };
    assert.deepEqual(await service.publishEvent(input), { createdCount: 1, duplicateCount: 0 });
    await assert.rejects(service.publishEvent({ ...input, eventId: "e".repeat(121) }), serverError(400));
    const closed: NotificationEventInput = { type: "PROJECT_RECRUITMENT_CLOSED", eventId: "c".repeat(120),
      closureEventId: "k".repeat(120), projectId: "prj_valid", projectTitle: "검증", occurredAt: now, recipientIds: ["usr_valid"] };
    assert.deepEqual(await service.publishEvent(closed), { createdCount: 1, duplicateCount: 0 });
    await assert.rejects(service.publishEvent({ ...closed, closureEventId: "k".repeat(121) }), serverError(400));
    assert.equal(repository.snapshot().length, 2);
  });

  for (const length of [36, 40]) {
    await check(`ID 호환 HTTP: ${length}자 6종 전달→웹 DTO→계정 분리·개별/전체 읽음·중복 방지`, async () => {
      await withHttpFixture(length, async ({ repository, module, clientApi, freelancerApi, observedStatuses }) => {
        for (const event of events(length)) {
          assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 1, duplicateCount: 0 });
          assert.deepEqual(await module.delivery.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 0, duplicateCount: 1 });
        }
        const clientList = await clientApi.getNotificationList();
        const freelancerList = await freelancerApi.getNotificationList();
        assert.equal(clientList.items.length, 2);
        assert.equal(clientList.unreadCount, 2);
        assert.equal(freelancerList.items.length, 5);
        assert.equal(freelancerList.unreadCount, 5);
        assert.equal(new Set([...clientList.items, ...freelancerList.items].map(row => row.type)).size, 6);
        assert.ok([...clientList.items, ...freelancerList.items].every(row =>
          row.linkUrl === `/projects/${identifier(length, "prj_")}` && row.resourceId?.length === length
          && !("recipientId" in row) && !("dedupeKey" in row)));
        const seededId = notification(length).id;
        await assert.rejects(freelancerApi.markNotificationRead(seededId), clientError(404));
        await assert.rejects(clientApi.markNotificationRead(freelancerList.items[0].id), clientError(404));
        const read = await clientApi.markNotificationRead(seededId);
        assert.equal(read.item.id, seededId);
        assert.equal(read.item.readAt, now);
        assert.equal(read.unreadCount, 1);
        assert.deepEqual(await clientApi.markNotificationRead(seededId), read);
        assert.deepEqual(await clientApi.markAllNotificationsRead(), { updatedCount: 1, unreadCount: 0 });
        assert.deepEqual(await clientApi.markAllNotificationsRead(), { updatedCount: 0, unreadCount: 0 });
        assert.deepEqual(await freelancerApi.getUnreadCount(), { unreadCount: 5 });
        assert.deepEqual(await freelancerApi.markAllNotificationsRead(), { updatedCount: 5, unreadCount: 0 });
        assert.ok((await clientApi.getNotificationList()).items.every(row => row.readAt === now));
        assert.equal(repository.snapshot().length, 7);
        assert.equal(observedStatuses.filter(status => status === 404).length, 2);
        assert.ok(observedStatuses.every(status => status === 200 || status === 404));
      });
    });
  }
}
