import { createHash, randomBytes } from "node:crypto";
import { invalidNotificationInput, NotificationApiError, notificationStorageError } from "./notification.errors";
import type { NotificationRepository } from "./notification.repository";
import {
  NOTIFICATION_TYPES,
  type NotificationAuthContext,
  type NotificationEventInput,
  type NotificationItem,
  type NotificationListResponse,
  type NotificationRecord,
  type NotificationUnreadCountResponse,
  type PublishNotificationResponse,
  type ReadAllNotificationsResponse,
  type ReadNotificationResponse,
  type SafeNotificationDeliveryResponse,
} from "./notification.types";

export { NotificationApiError } from "./notification.errors";

const ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}(?![\s\S])/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const COMMON_EVENT_KEYS = ["type", "eventId", "projectId", "projectTitle", "occurredAt"];

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    && (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null);
}

function isEntityId(input: unknown): input is string {
  return typeof input === "string" && ENTITY_ID.test(input);
}

function requireEntityId(input: unknown): string {
  if (!isEntityId(input)) throw invalidNotificationInput();
  return input;
}

function requireEventId(input: unknown): string {
  if (typeof input !== "string" || input.length < 1 || input.length > 120
    || input.trim() !== input || CONTROL_CHARACTERS.test(input)) throw invalidNotificationInput();
  return input;
}

function requireTimestamp(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input)) {
    throw invalidNotificationInput();
  }
  const timestamp = Date.parse(input);
  const canonicalInput = input.includes(".")
    ? input.replace(/\.(\d{1,3})Z$/, (_match, digits: string) => `.${digits.padEnd(3, "0")}Z`)
    : input.replace(/Z$/, ".000Z");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== canonicalInput) {
    throw invalidNotificationInput();
  }
  return canonicalInput;
}

function requireExactKeys(input: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    throw invalidNotificationInput();
  }
}

/** 인증 컨텍스트는 검증된 resolver에서만 전달하며 공개 recipient selector는 받지 않는다. */
export function requireNotificationAuth(auth: unknown): { userId: string; isActive: true } {
  if (!isRecord(auth) || auth.isActive !== true || !isEntityId(auth.userId)) {
    throw new NotificationApiError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }
  return { userId: auth.userId, isActive: true };
}

function parseNotificationEvent(input: unknown): NotificationEventInput {
  if (!isRecord(input)) throw invalidNotificationInput();
  const eventId = requireEventId(input.eventId);
  const projectId = requireEntityId(input.projectId);
  if (typeof input.projectTitle !== "string" || !input.projectTitle.trim()
    || input.projectTitle.length > 100 || CONTROL_CHARACTERS.test(input.projectTitle)) throw invalidNotificationInput();
  const base = {
    eventId,
    projectId,
    projectTitle: input.projectTitle.trim(),
    occurredAt: requireTimestamp(input.occurredAt),
  };

  switch (input.type) {
    case "APPLICATION_SUBMITTED":
      requireExactKeys(input, [...COMMON_EVENT_KEYS, "applicationId", "clientId"]);
      return { ...base, type: input.type, applicationId: requireEntityId(input.applicationId), clientId: requireEntityId(input.clientId) };
    case "APPLICATION_ACCEPTED":
    case "APPLICATION_REJECTED":
    case "APPLICATION_AUTO_REJECTED":
      requireExactKeys(input, [...COMMON_EVENT_KEYS, "applicationId", "freelancerId"]);
      return { ...base, type: input.type, applicationId: requireEntityId(input.applicationId), freelancerId: requireEntityId(input.freelancerId) };
    case "PROJECT_RECRUITMENT_CLOSED":
      requireExactKeys(input, [...COMMON_EVENT_KEYS, "closureEventId", "recipientIds"]);
      if (!Array.isArray(input.recipientIds)) throw invalidNotificationInput();
      return { ...base, type: input.type, closureEventId: requireEventId(input.closureEventId), recipientIds: Array.from(input.recipientIds, requireEntityId) };
    case "PROJECT_CANCELED":
      requireExactKeys(input, [...COMMON_EVENT_KEYS, "closureEventId", "pendingFreelancerIds", "acceptedFreelancerId"]);
      if (!Array.isArray(input.pendingFreelancerIds)) throw invalidNotificationInput();
      return {
        ...base,
        type: input.type,
        closureEventId: requireEventId(input.closureEventId),
        pendingFreelancerIds: Array.from(input.pendingFreelancerIds, requireEntityId),
        acceptedFreelancerId: input.acceptedFreelancerId === null ? null : requireEntityId(input.acceptedFreelancerId),
      };
    default:
      throw invalidNotificationInput();
  }
}

function recipientIdsFor(event: NotificationEventInput): string[] {
  switch (event.type) {
    case "APPLICATION_SUBMITTED": return [event.clientId];
    case "APPLICATION_ACCEPTED":
    case "APPLICATION_REJECTED":
    case "APPLICATION_AUTO_REJECTED": return [event.freelancerId];
    case "PROJECT_RECRUITMENT_CLOSED": return [...new Set(event.recipientIds)];
    case "PROJECT_CANCELED": return [...new Set([
      ...event.pendingFreelancerIds,
      ...(event.acceptedFreelancerId === null ? [] : [event.acceptedFreelancerId]),
    ])];
  }
}

function notificationCopy(event: NotificationEventInput): { title: string; body: string } {
  const project = `${event.projectTitle} 프로젝트`;
  switch (event.type) {
    case "APPLICATION_SUBMITTED": return { title: "새로운 지원이 도착했습니다", body: `${project}의 지원 내용을 확인해 주세요.` };
    case "APPLICATION_ACCEPTED": return { title: "지원이 수락되었습니다", body: `${project}의 지원이 수락되었습니다. 다음 진행 내용을 확인해 주세요.` };
    case "APPLICATION_REJECTED": return { title: "지원 결과를 확인해 주세요", body: `${project}의 지원이 수락되지 않았습니다.` };
    case "APPLICATION_AUTO_REJECTED": return { title: "다른 지원자가 선정되었습니다", body: `${project}에 다른 지원자가 선정되어 지원이 마감되었습니다.` };
    case "PROJECT_RECRUITMENT_CLOSED": return { title: "프로젝트 모집이 마감되었습니다", body: `${project}의 모집이 마감되었습니다. 현재 진행 상황을 확인해 주세요.` };
    case "PROJECT_CANCELED": return { title: "프로젝트가 취소되었습니다", body: `${project}가 취소되었습니다. 자세한 내용을 확인해 주세요.` };
  }
}

function requireCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) throw notificationStorageError();
  return count;
}

function toNotificationItem(record: NotificationRecord, recipientId: string): NotificationItem {
  if (!isRecord(record) || record.recipientId !== recipientId || !isEntityId(record.id)
    || !NOTIFICATION_TYPES.includes(record.type) || typeof record.title !== "string"
    || record.title.length < 1 || record.title.length > 100 || typeof record.body !== "string"
    || record.body.length > 500 || typeof record.linkUrl !== "string"
    || !/^\/projects\/[A-Za-z0-9][A-Za-z0-9_-]{0,39}(?![\s\S])/.test(record.linkUrl)
    || (record.resourceType !== null && (typeof record.resourceType !== "string" || record.resourceType.length > 30))
    || (record.resourceId !== null && !isEntityId(record.resourceId))) throw notificationStorageError();
  return {
    id: record.id,
    type: record.type,
    title: record.title,
    body: record.body,
    linkUrl: record.linkUrl,
    resourceType: record.resourceType,
    resourceId: record.resourceId,
    readAt: record.readAt === null ? null : requireTimestamp(record.readAt),
    createdAt: requireTimestamp(record.createdAt),
  };
}

/** 지원/프로젝트의 상태나 수신자를 직접 조회하지 않고 원천 snapshot만 처리한다. */
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async getNotificationList(auth: NotificationAuthContext): Promise<NotificationListResponse> {
    const { userId } = requireNotificationAuth(auth);
    try {
      const snapshot = await this.repository.findNotificationListByRecipient(userId);
      if (!Array.isArray(snapshot.records) || snapshot.records.length > 100) throw notificationStorageError();
      const items = Array.from(snapshot.records, (record) => toNotificationItem(record, userId));
      const unreadCount = requireCount(snapshot.unreadCount);
      if (unreadCount < items.filter((item) => item.readAt === null).length) throw notificationStorageError();
      return { items, unreadCount, limit: 100 };
    } catch {
      throw notificationStorageError();
    }
  }

  async getUnreadCount(auth: NotificationAuthContext): Promise<NotificationUnreadCountResponse> {
    const { userId } = requireNotificationAuth(auth);
    try {
      return { unreadCount: requireCount(await this.repository.countUnreadByRecipient(userId)) };
    } catch {
      throw notificationStorageError();
    }
  }

  async markNotificationRead(auth: NotificationAuthContext, notificationId: string): Promise<ReadNotificationResponse> {
    const { userId } = requireNotificationAuth(auth);
    requireEntityId(notificationId);
    let snapshot;
    try {
      snapshot = await this.repository.markReadByRecipient(userId, notificationId, requireTimestamp(this.clock()));
      if (snapshot !== null) {
        const item = toNotificationItem(snapshot.record, userId);
        if (item.id !== notificationId || item.readAt === null) throw notificationStorageError();
        return { item, unreadCount: requireCount(snapshot.unreadCount) };
      }
    } catch {
      throw notificationStorageError();
    }
    throw new NotificationApiError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.");
  }

  async markAllNotificationsRead(auth: NotificationAuthContext): Promise<ReadAllNotificationsResponse> {
    const { userId } = requireNotificationAuth(auth);
    try {
      const snapshot = await this.repository.markAllReadByRecipient(userId, requireTimestamp(this.clock()));
      if (snapshot.unreadCount !== 0) throw notificationStorageError();
      return { updatedCount: requireCount(snapshot.updatedCount), unreadCount: 0 };
    } catch {
      throw notificationStorageError();
    }
  }

  async publishEvent(input: NotificationEventInput): Promise<PublishNotificationResponse> {
    const event = parseNotificationEvent(input);
    // 모든 입력을 검증/복제한 뒤에만 첫 INSERT를 한다. 재전달에서도 원래 사건 시각을 보존한다.
    const recipients = recipientIdsFor(event);
    const sourceEventId = "closureEventId" in event ? event.closureEventId : event.eventId;
    const copy = notificationCopy(event);
    let createdCount = 0;
    let duplicateCount = 0;
    try {
      for (const recipientId of recipients) {
        const dedupeKey = createHash("sha256")
          .update(JSON.stringify([event.type, sourceEventId, recipientId])).digest("hex");
        const outcome = await this.repository.insertIfAbsent({
          id: `ntf_${randomBytes(12).toString("hex")}`,
          recipientId,
          dedupeKey,
          type: event.type,
          ...copy,
          linkUrl: `/projects/${event.projectId}`,
          resourceType: "applicationId" in event ? "application" : "project",
          resourceId: "applicationId" in event ? event.applicationId : event.projectId,
          readAt: null,
          createdAt: event.occurredAt,
        });
        if (outcome === "created") createdCount += 1;
        else if (outcome === "duplicate") duplicateCount += 1;
        else throw notificationStorageError();
      }
      return { createdCount, duplicateCount };
    } catch {
      throw notificationStorageError();
    }
  }

  async deliverNotificationEventSafely(input: NotificationEventInput): Promise<SafeNotificationDeliveryResponse> {
    try {
      return { status: "delivered", ...await this.publishEvent(input) };
    } catch {
      return { status: "retry_required" };
    }
  }
}
