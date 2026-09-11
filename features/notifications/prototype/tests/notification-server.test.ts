import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { NotificationService } from "../server/notification.service";
import { createNotificationRouter } from "../server/notification.routes";
import { InMemoryNotificationRepository } from "../mock/notification-repository.mock";
import { NOTIFICATION_TYPES } from "../server/notification.types";
import type { NotificationEventInput, NotificationRecord } from "../server/notification.types";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const now = "2026-09-07T03:00:00.000Z";
const auth = (userId = "usr_client") => ({ userId, isActive: true });
const base = { eventId: "evt_1", projectId: "prj_1", projectTitle: "브랜드 웹사이트", occurredAt: now };
const submitted = (eventId = "evt_1"): Extract<NotificationEventInput, { type: "APPLICATION_SUBMITTED" }> => ({ ...base, eventId,
  type: "APPLICATION_SUBMITTED", applicationId: "apl_1", clientId: "usr_client" });
const record = (id: string, recipientId = "usr_client", createdAt = now): NotificationRecord => ({
  id, recipientId, type: "APPLICATION_SUBMITTED", title: "새 지원", body: "지원 내용을 확인해 주세요.",
  linkUrl: "/projects/prj_1", resourceType: "application", resourceId: "apl_1",
  dedupeKey: `seed:${id}`, readAt: null, createdAt,
});
const setup = (seed: NotificationRecord[] = []) => {
  const repository = new InMemoryNotificationRepository(seed);
  return { repository, service: new NotificationService(repository, () => now) };
};
const hasCode = (code: string) => (error: unknown) =>
  !!error && typeof error === "object" && "code" in error && error.code === code;

export async function runNotificationServerTests(check: Check) {
  await check("규칙 1: 활성 사용자만 조회·읽기 가능", async () => {
    const { service } = setup([record("ntf_1")]);
    for (const identity of [null, { userId: "usr_client", isActive: false }]) {
      await assert.rejects(() => service.getNotificationList(identity), hasCode("UNAUTHORIZED"));
      await assert.rejects(() => service.getUnreadCount(identity), hasCode("UNAUTHORIZED"));
      await assert.rejects(() => service.markNotificationRead(identity, "ntf_1"), hasCode("UNAUTHORIZED"));
      await assert.rejects(() => service.markAllNotificationsRead(identity), hasCode("UNAUTHORIZED"));
    }
  });
  await check("규칙 1: 타인과 없는 알림 동일 404·목록 격리", async () => {
    const { service } = setup([record("ntf_1"), record("ntf_other", "usr_other")]);
    assert.equal((await service.getNotificationList(auth())).items.length, 1);
    for (const id of ["ntf_other", "ntf_missing"]) {
      await assert.rejects(() => service.markNotificationRead(auth(), id), hasCode("NOTIFICATION_NOT_FOUND"));
    }
  });
  await check("규칙 2: 최근 100건·전체 미읽음·동률 정렬·조회 비파괴", async () => {
    const seed = Array.from({ length: 105 }, (_, n) => record(`ntf_${String(n).padStart(3, "0")}`));
    const { service, repository } = setup(seed);
    const result = await service.getNotificationList(auth());
    assert.equal(result.items.length, 100); assert.equal(result.limit, 100); assert.equal(result.unreadCount, 105);
    assert.equal(result.items[0].id, "ntf_104"); assert.equal(result.items[99].id, "ntf_005");
    assert.equal(repository.snapshot().filter(item => item.readAt !== null).length, 0);
  });
  await check("규칙 2: 생성 시각 내림차순과 빈 응답", async () => {
    const { service } = setup([record("ntf_z", "usr_client", "2026-09-06T00:00:00.000Z"), record("ntf_a")]);
    assert.deepEqual((await service.getNotificationList(auth())).items.map(item => item.id), ["ntf_a", "ntf_z"]);
    assert.deepEqual(await service.getNotificationList(auth("usr_empty")), { items: [], unreadCount: 0, limit: 100 });
  });
  await check("규칙 3: 개별 읽음 최초 시각·반복 성공·badge", async () => {
    const { repository } = setup([record("ntf_1"), record("ntf_2")]);
    const first = new NotificationService(repository, () => now);
    const second = new NotificationService(repository, () => "2026-09-08T00:00:00.000Z");
    const result = await first.markNotificationRead(auth(), "ntf_1");
    assert.equal(result.item.readAt, now); assert.equal(result.unreadCount, 1);
    assert.deepEqual(await second.markNotificationRead(auth(), "ntf_1"), result);
    assert.deepEqual(await first.getUnreadCount(auth()), { unreadCount: 1 });
  });
  await check("규칙 4: 전체 읽음 100건 밖 포함·타인 제외·새 알림 보존", async () => {
    const oldRead = { ...record("ntf_read"), readAt: "2026-09-06T01:00:00.000Z" };
    const { service, repository } = setup([...Array.from({ length: 105 }, (_, n) => record(`ntf_${n}`)),
      oldRead, record("ntf_other", "usr_other")]);
    assert.deepEqual(await service.markAllNotificationsRead(auth()), { updatedCount: 105, unreadCount: 0 });
    assert.deepEqual(await service.markAllNotificationsRead(auth()), { updatedCount: 0, unreadCount: 0 });
    assert.equal(repository.snapshot().find(item => item.id === "ntf_read")?.readAt, oldRead.readAt);
    assert.equal(repository.snapshot().find(item => item.id === "ntf_other")?.readAt, null);
    await service.publishEvent(submitted());
    assert.equal((await service.getUnreadCount(auth())).unreadCount, 1);
    assert.equal(repository.snapshot().length, 108);
  });
  for (const [rule, type, recipientId] of [
    [5, "APPLICATION_SUBMITTED", "usr_client"], [6, "APPLICATION_ACCEPTED", "usr_free"],
    [7, "APPLICATION_REJECTED", "usr_free"], [8, "APPLICATION_AUTO_REJECTED", "usr_free"],
  ] as const) {
    await check(`규칙 ${rule}: ${type} 지정 당사자 한 명`, async () => {
      const { service, repository } = setup();
      const event = type === "APPLICATION_SUBMITTED" ? submitted() : {
        ...base, type, applicationId: "apl_1", freelancerId: recipientId,
      };
      assert.deepEqual(await service.publishEvent(event), { createdCount: 1, duplicateCount: 0 });
      const rows = repository.snapshot();
      assert.equal(rows.length, 1); assert.equal(rows[0].recipientId, recipientId); assert.equal(rows[0].type, type);
      assert.equal(rows[0].resourceType, "application"); assert.equal(rows[0].resourceId, "apl_1");
    });
  }
  await check("규칙 9: 마감 snapshot·수신자 중복 제거·closureEventId", async () => {
    const { service, repository } = setup();
    const event: NotificationEventInput = { ...base, type: "PROJECT_RECRUITMENT_CLOSED",
      closureEventId: "close:1", recipientIds: ["usr_f1", "usr_f2", "usr_f1"] };
    assert.deepEqual(await service.publishEvent(event), { createdCount: 2, duplicateCount: 0 });
    assert.ok(repository.snapshot().every(row => row.type === "PROJECT_RECRUITMENT_CLOSED"));
    assert.deepEqual(await service.publishEvent({ ...event, eventId: "transport:retry" }), { createdCount: 0, duplicateCount: 2 });
    await assert.rejects(() => service.publishEvent({ ...event, closureEventId: "" }), hasCode("VALIDATION_ERROR"));
  });
  await check("규칙 10: 취소 대기+선정 합집합·선정자 없음", async () => {
    const { service, repository } = setup();
    const event: NotificationEventInput = { ...base, type: "PROJECT_CANCELED", closureEventId: "cancel:1",
      pendingFreelancerIds: ["usr_f1", "usr_f2"], acceptedFreelancerId: "usr_f2" };
    assert.equal((await service.publishEvent(event)).createdCount, 2);
    assert.ok(repository.snapshot().every(row => row.type === "PROJECT_CANCELED"));
    assert.equal((await service.publishEvent({ ...event, closureEventId: "cancel:2", acceptedFreelancerId: "usr_selected" })).createdCount, 3);
    assert.equal((await service.publishEvent({ ...event, closureEventId: "cancel:3", pendingFreelancerIds: [], acceptedFreelancerId: null })).createdCount, 0);
  });
  await check("규칙 11: 동시 재전달 중복 방지·타입/수신자 분리·새 모집 회차", async () => {
    const { service, repository } = setup();
    const results = await Promise.all(Array.from({ length: 20 }, () => service.publishEvent(submitted())));
    assert.equal(results.reduce((sum, item) => sum + item.createdCount, 0), 1);
    await service.publishEvent({ ...submitted(), clientId: "usr_another" });
    await service.publishEvent({ ...base, type: "APPLICATION_ACCEPTED", applicationId: "apl_1", freelancerId: "usr_client" });
    for (const closureEventId of ["close:round1", "close:round2"]) {
      await service.publishEvent({ ...base, type: "PROJECT_RECRUITMENT_CLOSED", closureEventId, recipientIds: ["usr_client"] });
    }
    const rows = repository.snapshot(); assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map(row => row.dedupeKey)).size, 5);
    assert.ok(rows.every(row => row.dedupeKey.length <= 120 && row.id.length <= 30));
  });
  await check("규칙 12: 긴 문구 제한·안전한 프로젝트 링크·DTO 최소화", async () => {
    const { service, repository } = setup();
    await service.publishEvent({ ...submitted(), projectTitle: "프".repeat(100) });
    const row = repository.snapshot()[0];
    assert.ok(row.title.length <= 100 && row.body.length <= 500);
    assert.equal(row.linkUrl, "/projects/prj_1");
    const item = (await service.getNotificationList(auth())).items[0];
    assert.ok(!("recipientId" in item) && !("dedupeKey" in item));
    item.title = "외부 변경";
    assert.notEqual(repository.snapshot()[0].title, "외부 변경");
  });
  await check("규칙 12: 잘못된 ID·시각·event 키 입력 전체 검증 후 저장", async () => {
    const { service, repository } = setup();
    for (const event of [{ ...submitted(), projectId: "../admin" }, { ...submitted(), occurredAt: "invalid" },
      { ...submitted(), eventId: "x".repeat(121) }, { ...submitted(), clientId: "x".repeat(41) },
      { ...submitted(), projectTitle: "프".repeat(101) }, { ...submitted(), occurredAt: "2026-02-30T00:00:00Z" },
      { ...base, type: "PROJECT_RECRUITMENT_CLOSED", closureEventId: "close:1", recipientIds: ["usr_f1", "../bad"] }]) {
      await assert.rejects(() => service.publishEvent(event as NotificationEventInput), hasCode("VALIDATION_ERROR"));
    }
    assert.equal(repository.snapshot().length, 0);
  });
  await check("규칙 13: 부분 실패 non-throw·같은 snapshot 재전달 중복 없음", async () => {
    const { service, repository } = setup();
    const event: NotificationEventInput = { ...base, type: "PROJECT_CANCELED", closureEventId: "cancel:1",
      pendingFreelancerIds: ["usr_f1", "usr_f2"], acceptedFreelancerId: "usr_selected" };
    repository.failNextInsert(1);
    const domainResult = { accepted: true };
    assert.deepEqual(await service.deliverNotificationEventSafely(event), { status: "retry_required" });
    assert.deepEqual(domainResult, { accepted: true });
    assert.equal(repository.snapshot().length, 1);
    assert.deepEqual(await service.deliverNotificationEventSafely(event), { status: "delivered", createdCount: 2, duplicateCount: 1 });
    assert.equal(repository.snapshot().length, 3);
  });
  await check("규칙 14: enum13 보존·선택종류/별칭/REVIEW_CREATED 생성 거부", async () => {
    const { service } = setup(); assert.equal(NOTIFICATION_TYPES.length, 13);
    for (const type of ["REVIEW_CREATED", "RECRUITMENT_CLOSED", "PAYMENT_PAID", ...NOTIFICATION_TYPES.slice(6)]) {
      await assert.rejects(() => service.publishEvent({ ...submitted(), type } as NotificationEventInput), hasCode("VALIDATION_ERROR"));
    }
  });
  await check("규칙 18: 마감 전달 결과는 ACK 신호만 제공·SLA는 운영 별도", async () => {
    const { service, repository } = setup();
    const event: NotificationEventInput = { ...base, type: "PROJECT_RECRUITMENT_CLOSED", closureEventId: "close:1", recipientIds: ["usr_f1"] };
    repository.failNextInsert();
    assert.deepEqual(await service.deliverNotificationEventSafely(event), { status: "retry_required" });
    assert.equal((await service.deliverNotificationEventSafely(event)).status, "delivered");
    // No test claims a real scheduler, durable storage or the 10-minute production SLA.
  });
  await check("HTTP: 목록·배지·개별/전체 읽음·인증·주입 차단·비공개 생성", async () => {
    const { service } = setup([record("ntf_1"), record("ntf_2"), record("ntf_other", "usr_other")]);
    const app = express();
    app.use(createNotificationRouter(service,
      req => req.headers.authorization === "Bearer fixture" ? auth() : null));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/notifications`;
    const request = (suffix = "", method = "GET", body?: object, authorized = true) => fetch(origin + suffix, {
      method, headers: { ...(authorized ? { Authorization: "Bearer fixture" } : {}), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      const list = await request(); assert.equal(list.status, 200);
      assert.equal(list.headers.get("cache-control"), "no-store"); assert.equal((await list.json()).items.length, 2);
      assert.deepEqual(await (await request("/unread-count")).json(), { unreadCount: 2 });
      assert.equal((await request("/ntf_1/read", "POST")).status, 200);
      assert.deepEqual(await (await request("/read-all", "POST", {})).json(), { updatedCount: 1, unreadCount: 0 });
      assert.equal((await request("/ntf_other/read", "POST")).status, 404);
      assert.equal((await request("/ntf_missing/read", "POST")).status, 404);
      assert.equal((await request("?recipientId=usr_other")).status, 400);
      assert.equal((await request("/read-all", "POST", { userId: "usr_other" })).status, 400);
      const unauthorized = await request("?recipientId=usr_other", "GET", undefined, false);
      assert.equal(unauthorized.status, 401); assert.equal((await unauthorized.json()).error.code, "UNAUTHORIZED");
      assert.equal((await request("", "POST", submitted())).status, 404);
      for (const authorized of [false, true]) {
        const malformed = await fetch(origin + "/read-all", { method: "POST", headers: {
          "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer fixture" } : {}),
        }, body: "{invalid" });
        assert.equal(malformed.status, authorized ? 400 : 401);
        assert.ok((await malformed.json()).error.code);
      }
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
}
