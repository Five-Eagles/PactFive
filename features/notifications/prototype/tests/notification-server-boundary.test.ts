import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { InMemoryNotificationRepository } from "../mock/notification-repository.mock";
import type { NotificationRepository } from "../server/notification.repository";
import { createNotificationRouter, type NotificationAuthResolver } from "../server/notification.routes";
import { NotificationApiError, NotificationService } from "../server/notification.service";
import type { NotificationAuthContext, NotificationEventInput, NotificationRecord } from "../server/notification.types";

type Check = (name: string, fn: () => void | Promise<void>) => Promise<void>;
const now = "2026-09-07T03:00:00.000Z";
const auth = { userId: "usr_client", isActive: true };
const internalMessage = "알림을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const record = (id = "ntf_1"): NotificationRecord => ({
  id, recipientId: auth.userId, dedupeKey: `seed:${id}`, type: "APPLICATION_SUBMITTED",
  title: "새 지원", body: "지원 내용을 확인해 주세요.", linkUrl: "/projects/prj_1",
  resourceType: "application", resourceId: "apl_1", readAt: null, createdAt: now,
});
const event = (): NotificationEventInput => ({
  type: "PROJECT_RECRUITMENT_CLOSED", eventId: "evt_close", closureEventId: "closure:1",
  projectId: "prj_1", projectTitle: "브랜드 웹사이트", occurredAt: now,
  recipientIds: ["usr_client", "usr_second"],
});
const expectError = (status: number, code: string) => (error: unknown) => {
  assert.ok(error instanceof NotificationApiError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  if (status === 500) assert.equal(error.message, internalMessage);
  return true;
};

function repositoryWith(base: InMemoryNotificationRepository, overrides: Partial<NotificationRepository>): NotificationRepository {
  return {
    findNotificationListByRecipient: (recipientId) => base.findNotificationListByRecipient(recipientId),
    countUnreadByRecipient: (recipientId) => base.countUnreadByRecipient(recipientId),
    markReadByRecipient: (recipientId, id, readAt) => base.markReadByRecipient(recipientId, id, readAt),
    markAllReadByRecipient: (recipientId, readAt) => base.markAllReadByRecipient(recipientId, readAt),
    insertIfAbsent: (item) => base.insertIfAbsent(item),
    ...overrides,
  };
}

async function withHttpServer(
  service: NotificationService,
  resolver: NotificationAuthResolver,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  // Production auth must precede parsing; the feature router owns JSON parsing.
  app.use(createNotificationRouter(service, resolver));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/api/v1/notifications`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function expectHttpError(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json() as { error: { code: string; message: string } };
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
  assert.equal(body.error.code, code);
  assert.equal(body.error.message, status === 500 ? internalMessage
    : status === 401 ? "로그인이 필요합니다." : "요청 값이 올바르지 않습니다.");
}

export async function runNotificationServerBoundaryTests(check: Check): Promise<void> {
  await check("서버 경계: 조회·count·읽기 저장 실패는 내부 정보 없는 500", async () => {
    const base = new InMemoryNotificationRepository([record()]);
    const fail = async () => { throw new Error("adapter secret: user@example.com/token"); };
    const service = new NotificationService(repositoryWith(base, {
      findNotificationListByRecipient: fail, countUnreadByRecipient: fail,
      markReadByRecipient: fail, markAllReadByRecipient: fail,
    }), () => now);
    for (const operation of [
      () => service.getNotificationList(auth), () => service.getUnreadCount(auth),
      () => service.markNotificationRead(auth, "ntf_1"), () => service.markAllNotificationsRead(auth),
    ]) await assert.rejects(operation, expectError(500, "INTERNAL_ERROR"));
    assert.deepEqual(base.snapshot(), [record()]);
  });

  await check("서버 경계: ID 끝 개행·숫자·공백은 인증과 이벤트에서 거부", async () => {
    const base = new InMemoryNotificationRepository([record()]);
    const service = new NotificationService(base, () => now);
    for (const id of ["usr_client\n", "usr_client\r", "usr_client\u2028", "usr_client ", 123]) {
      await assert.rejects(() => service.getNotificationList({ userId: id, isActive: true } as NotificationAuthContext),
        expectError(401, "UNAUTHORIZED"));
      await assert.rejects(() => service.markNotificationRead(auth, id as string), expectError(400, "VALIDATION_ERROR"));
      for (const patch of [{ projectId: id }, { recipientIds: ["usr_client", id] }]) {
        await assert.rejects(() => service.publishEvent({ ...event(), ...patch } as NotificationEventInput),
          expectError(400, "VALIDATION_ERROR"));
      }
    }
    assert.deepEqual(base.snapshot(), [record()]);
  });

  await check("서버 경계: 희소 배열과 잘못된 후반 수신자도 첫 저장 전에 거부", async () => {
    const base = new InMemoryNotificationRepository();
    const service = new NotificationService(base, () => now);
    const sparse = ["usr_client", , "usr_second"];
    for (const recipientIds of [sparse, ["usr_client", undefined], ["usr_client", "invalid/id"]]) {
      const closed = { ...event(), recipientIds } as NotificationEventInput;
      await assert.rejects(() => service.publishEvent(closed), expectError(400, "VALIDATION_ERROR"));
      const canceled = {
        type: "PROJECT_CANCELED", eventId: "evt_cancel", closureEventId: "closure:2",
        projectId: "prj_1", projectTitle: "브랜드 웹사이트", occurredAt: now,
        pendingFreelancerIds: recipientIds, acceptedFreelancerId: null,
      } as NotificationEventInput;
      await assert.rejects(() => service.publishEvent(canceled), expectError(400, "VALIDATION_ERROR"));
      assert.deepEqual(await service.deliverNotificationEventSafely(closed), { status: "retry_required" });
    }
    assert.deepEqual(base.snapshot(), []);
  });

  await check("서버 경계: 잘못된 저장 DTO·타인·숫자 ID·개행 링크를 공개하지 않음", async () => {
    const base = new InMemoryNotificationRepository();
    const badRows: unknown[] = [
      null, { ...record(), recipientId: "usr_other" }, { ...record(), id: 123 },
      { ...record(), id: "ntf_1\n" }, { ...record(), resourceId: 123 },
      { ...record(), resourceId: "apl_1\n" }, { ...record(), linkUrl: "/projects/prj_1\n" },
      { ...record(), linkUrl: "https://example.com/projects/prj_1" },
      { ...record(), createdAt: "2026-02-30T03:00:00.000Z" },
      { ...record(), readAt: "not-a-date" }, { ...record(), type: "REVIEW_CREATED" },
    ];
    for (const badRow of badRows) {
      const service = new NotificationService(repositoryWith(base, {
        findNotificationListByRecipient: async () => ({ records: [badRow] as NotificationRecord[], unreadCount: 1 }),
      }));
      await assert.rejects(() => service.getNotificationList(auth), expectError(500, "INTERNAL_ERROR"));
    }
    const service = new NotificationService(repositoryWith(base, {
      findNotificationListByRecipient: async () => ({ records: new Array<NotificationRecord>(1), unreadCount: 0 }),
    }));
    await assert.rejects(() => service.getNotificationList(auth), expectError(500, "INTERNAL_ERROR"));
  });

  await check("서버 경계: 잘못된 count·읽기 결과를 성공으로 반환하지 않음", async () => {
    const base = new InMemoryNotificationRepository();
    for (const count of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
      const service = new NotificationService(repositoryWith(base, {
        countUnreadByRecipient: async () => count as number,
        findNotificationListByRecipient: async () => ({ records: [], unreadCount: count as number }),
      }));
      await assert.rejects(() => service.getUnreadCount(auth), expectError(500, "INTERNAL_ERROR"));
      await assert.rejects(() => service.getNotificationList(auth), expectError(500, "INTERNAL_ERROR"));
    }
    for (const badRow of [record(), { ...record("ntf_other"), readAt: now }, { ...record(), recipientId: "usr_other", readAt: now }]) {
      const service = new NotificationService(repositoryWith(base, {
        markReadByRecipient: async () => ({ record: badRow, unreadCount: 0 }),
      }), () => now);
      await assert.rejects(() => service.markNotificationRead(auth, "ntf_1"), expectError(500, "INTERNAL_ERROR"));
    }
    for (const result of [{ updatedCount: -1, unreadCount: 0 }, { updatedCount: 1, unreadCount: 1 }]) {
      const service = new NotificationService(repositoryWith(base, { markAllReadByRecipient: async () => result }), () => now);
      await assert.rejects(() => service.markAllNotificationsRead(auth), expectError(500, "INTERNAL_ERROR"));
    }
    const impossibleCount = new NotificationService(repositoryWith(base, {
      findNotificationListByRecipient: async () => ({ records: [record()], unreadCount: 0 }),
    }));
    await assert.rejects(() => impossibleCount.getNotificationList(auth), expectError(500, "INTERNAL_ERROR"));
  });

  await check("서버 경계: 유효하지 않은 시계·시계 예외는 읽음 저장 전 실패", async () => {
    const clocks: (() => string)[] = [
      () => "not-a-date", () => "2026-02-30T03:00:00.000Z", () => `${now}\n`,
      () => null as unknown as string, () => { throw new Error("clock secret"); },
    ];
    for (const clock of clocks) {
      const base = new InMemoryNotificationRepository([record()]);
      const service = new NotificationService(base, clock);
      await assert.rejects(() => service.markNotificationRead(auth, "ntf_1"), expectError(500, "INTERNAL_ERROR"));
      await assert.rejects(() => service.markAllNotificationsRead(auth), expectError(500, "INTERNAL_ERROR"));
      assert.deepEqual(base.snapshot(), [record()]);
      assert.equal((await service.getNotificationList(auth)).unreadCount, 1);
    }
  });

  await check("서버 경계: INSERT 성공 뒤 ACK 유실도 재시도 시 중복 없이 복구", async () => {
    const base = new InMemoryNotificationRepository();
    let loseFirstAck = true;
    const service = new NotificationService(repositoryWith(base, {
      insertIfAbsent: async (item) => {
        const result = await base.insertIfAbsent(item);
        if (loseFirstAck) { loseFirstAck = false; throw new Error("ack lost"); }
        return result;
      },
    }));
    assert.deepEqual(await service.deliverNotificationEventSafely(event()), { status: "retry_required" });
    assert.equal(base.snapshot().length, 1);
    assert.deepEqual(await service.deliverNotificationEventSafely(event()), {
      status: "delivered", createdCount: 1, duplicateCount: 1,
    });
    assert.deepEqual(base.snapshot().map(item => item.recipientId).sort(), ["usr_client", "usr_second"]);
    assert.deepEqual(await service.deliverNotificationEventSafely(event()), {
      status: "delivered", createdCount: 0, duplicateCount: 2,
    });
    const badAck = new NotificationService(repositoryWith(base, {
      insertIfAbsent: async () => "unknown" as "created",
    }));
    assert.deepEqual(await badAck.deliverNotificationEventSafely(event()), { status: "retry_required" });
  });

  await check("서버 경계: 저장 대기 중 원천 이벤트를 바꿔도 검증한 snapshot 사용", async () => {
    const base = new InMemoryNotificationRepository();
    let releaseFirstInsert: (() => void) | undefined;
    const firstInsert = new Promise<void>(resolve => { releaseFirstInsert = resolve; });
    let first = true;
    const service = new NotificationService(repositoryWith(base, {
      insertIfAbsent: async (item) => {
        if (first) { first = false; await firstInsert; }
        return base.insertIfAbsent(item);
      },
    }));
    const input = event();
    assert.equal(input.type, "PROJECT_RECRUITMENT_CLOSED");
    if (input.type !== "PROJECT_RECRUITMENT_CLOSED") throw new Error("fixture mismatch");
    const delivery = service.publishEvent(input);
    input.recipientIds[1] = "usr_injected";
    input.projectId = "prj_changed";
    input.projectTitle = "changed";
    input.closureEventId = "closure:changed";
    releaseFirstInsert?.();
    assert.deepEqual(await delivery, { createdCount: 2, duplicateCount: 0 });
    assert.deepEqual(base.snapshot().map(item => item.recipientId).sort(), ["usr_client", "usr_second"]);
    assert.ok(base.snapshot().every(item => item.linkUrl === "/projects/prj_1" && item.body.includes("브랜드 웹사이트")));
    assert.deepEqual(await service.publishEvent(event()), { createdCount: 0, duplicateCount: 2 });
  });

  await check("서버 경계: Mock 목록·읽음 응답과 count가 도착 알림과 섞이지 않음", async () => {
    const original = record();
    const base = new InMemoryNotificationRepository([original]);
    original.title = "outside mutation";
    const listing = base.findNotificationListByRecipient(auth.userId);
    const read = base.markReadByRecipient(auth.userId, "ntf_1", now);
    await base.insertIfAbsent(record("ntf_2"));
    const listSnapshot = await listing;
    assert.deepEqual(listSnapshot, { records: [record()], unreadCount: 1 });
    assert.deepEqual(await read, { record: { ...record(), readAt: now }, unreadCount: 0 });
    const allRead = base.markAllReadByRecipient(auth.userId, now);
    await base.insertIfAbsent(record("ntf_3"));
    assert.deepEqual(await allRead, { updatedCount: 1, unreadCount: 0 });
    assert.equal(await base.countUnreadByRecipient(auth.userId), 1);
    listSnapshot.records[0].title = "mutated response";
    assert.equal(base.snapshot()[0].title, "새 지원");
  });

  await check("서버 경계 HTTP: 삭제되는 query 키·잘못된 인코딩도 400, 무인증은 먼저 401", async () => {
    const base = new InMemoryNotificationRepository([record()]);
    await withHttpServer(new NotificationService(base, () => now), req => req.headers.authorization === "Bearer test" ? auth : null,
      async baseUrl => {
        for (const suffix of ["?__proto__[recipientId]=usr_other", "?constructor[recipientId]=usr_other", "?&", "?recipientId="]) {
          await expectHttpError(await fetch(`${baseUrl}${suffix}`, { headers: { authorization: "Bearer test" } }), 400, "VALIDATION_ERROR");
          await expectHttpError(await fetch(`${baseUrl}${suffix}`), 401, "UNAUTHORIZED");
        }
        for (const id of ["%E0%A4%A", "ntf_1%0A", "ntf_1%2Fextra"]) {
          await expectHttpError(await fetch(`${baseUrl}/${id}/read`, { method: "POST", headers: { authorization: "Bearer test" } }),
            400, "VALIDATION_ERROR");
          await expectHttpError(await fetch(`${baseUrl}/${id}/read`, { method: "POST" }), 401, "UNAUTHORIZED");
        }
      });
    assert.deepEqual(base.snapshot(), [record()]);
  });

  await check("서버 경계 HTTP: 실패·비활성·개행 인증과 임의 user header는 우회 불가", async () => {
    const base = new InMemoryNotificationRepository([record()]);
    const service = new NotificationService(base, () => now);
    const resolvers: [NotificationAuthResolver, number, string][] = [
      [() => { throw new Error("resolver secret token"); }, 500, "INTERNAL_ERROR"],
      [() => { const error = new URIError("resolver URI failure"); Object.assign(error, { status: 400 }); throw error; }, 500, "INTERNAL_ERROR"],
      [() => ({ userId: "usr_client\n", isActive: true }), 401, "UNAUTHORIZED"],
      [() => ({ userId: auth.userId, isActive: false }), 401, "UNAUTHORIZED"],
      [() => null, 401, "UNAUTHORIZED"],
    ];
    for (const [resolver, status, code] of resolvers) {
      await withHttpServer(service, resolver, async baseUrl => {
        await expectHttpError(await fetch(baseUrl, { headers: { "x-user-id": auth.userId } }), status, code);
      });
    }
    assert.deepEqual(base.snapshot(), [record()]);
  });

  await check("서버 경계 HTTP: 배열·null·다른 content type·큰 body는 읽음 전에 거부", async () => {
    const base = new InMemoryNotificationRepository([record()]);
    await withHttpServer(new NotificationService(base, () => now), req => req.headers.authorization === "Bearer test" ? auth : null,
      async baseUrl => {
        for (const [body, contentType] of [
          ["[]", "application/json"], ["null", "application/json"], ["{}", "text/plain"],
          [JSON.stringify({ padding: "x".repeat(5000) }), "application/json"],
        ]) {
          const request = { method: "POST", body, headers: { "content-type": contentType, authorization: "Bearer test" } };
          await expectHttpError(await fetch(`${baseUrl}/read-all`, request), 400, "VALIDATION_ERROR");
          await expectHttpError(await fetch(`${baseUrl}/read-all`, { ...request, headers: { "content-type": contentType } }),
            401, "UNAUTHORIZED");
        }
      });
    assert.deepEqual(base.snapshot(), [record()]);
  });
}
