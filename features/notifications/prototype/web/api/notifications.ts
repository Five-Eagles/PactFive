import type {
  NotificationApi, NotificationItem, NotificationListResponse, NotificationType,
} from "../../server/notification.types";
import { NOTIFICATION_TYPES } from "../../server/notification.types";

/** Deliberately browser-only: no server implementation or credential fixture import. */
export class NotificationApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "NotificationApiError";
  }
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}(?![\s\S])/;
export function isNotificationProjectLink(value: string): boolean {
  return /^\/projects\/[A-Za-z0-9][A-Za-z0-9_-]{0,29}(?![\s\S])/.test(value);
}
function invalidResponse(): never {
  throw new NotificationApiError(502, "INVALID_RESPONSE", "알림 응답을 확인할 수 없습니다. 다시 시도해 주세요.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalidResponse();
  return value;
}
function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) return invalidResponse();
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(result)
      || !Number.isFinite(Date.parse(result))) return invalidResponse();
  return result;
}
function nullableIdentifier(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !identifier.test(value)) return invalidResponse();
  return value;
}
function item(value: unknown): NotificationItem {
  const dto = record(value);
  const id = nullableIdentifier(dto.id);
  if (id === null || !NOTIFICATION_TYPES.includes(dto.type as NotificationType)) return invalidResponse();
  if (typeof dto.linkUrl !== "string" || !isNotificationProjectLink(dto.linkUrl)) return invalidResponse();
  // Explicit allowlist: internal recipientId/dedupeKey can never leak into UI state.
  return {
    id, type: dto.type as NotificationType, title: string(dto.title, 100), body: string(dto.body, 500),
    linkUrl: dto.linkUrl, resourceType: nullableIdentifier(dto.resourceType),
    resourceId: nullableIdentifier(dto.resourceId),
    readAt: dto.readAt === null ? null : timestamp(dto.readAt), createdAt: timestamp(dto.createdAt),
  };
}
function list(value: unknown): NotificationListResponse {
  const dto = record(value);
  if (dto.limit !== 100 || !Array.isArray(dto.items) || dto.items.length > 100) return invalidResponse();
  const items = dto.items.map(item);
  if (new Set(items.map((entry) => entry.id)).size !== items.length) return invalidResponse();
  const unreadCount = count(dto.unreadCount);
  if (unreadCount < items.filter((entry) => entry.readAt === null).length) return invalidResponse();
  return { items, unreadCount, limit: 100 };
}

export type NotificationHttpApiOptions = {
  getAccessToken: () => string | null | Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  /** Full collection endpoint, e.g. /api/v1/notifications. */
  baseUrl?: string;
};
export function createNotificationHttpApi(options: NotificationHttpApiOptions): NotificationApi {
  const endpoint = (options.baseUrl ?? "/api/v1/notifications").replace(/\/$/, "");
  const fetcher = options.fetch ?? globalThis.fetch;
  async function request(suffix: string, method: "GET" | "POST"): Promise<unknown> {
    try {
      const token = await options.getAccessToken();
      if (!token?.trim()) throw new NotificationApiError(401, "UNAUTHORIZED", "로그인이 필요합니다. 다시 로그인해 주세요.");
      const response = await fetcher(`${endpoint}${suffix}`, {
        method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store", credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 401) throw new NotificationApiError(401, "UNAUTHORIZED", "세션이 만료되었습니다. 다시 로그인해 주세요.");
        if (response.status === 404) throw new NotificationApiError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
        throw new NotificationApiError(response.status, response.status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR", "알림을 처리하지 못했습니다. 다시 시도해 주세요.");
      }
      if (response.status !== 200) return invalidResponse();
      try { return await response.json(); } catch { return invalidResponse(); }
    } catch (error) {
      if (error instanceof NotificationApiError) throw error;
      throw new NotificationApiError(0, "NETWORK_ERROR", "연결을 확인한 후 다시 시도해 주세요.");
    }
  }
  return {
    async getNotificationList() { return list(await request("", "GET")); },
    async getUnreadCount() { return { unreadCount: count(record(await request("/unread-count", "GET")).unreadCount) }; },
    async markNotificationRead(id) {
      if (!identifier.test(id)) throw new NotificationApiError(400, "VALIDATION_ERROR", "올바른 알림을 선택해 주세요.");
      const dto = record(await request(`/${id}/read`, "POST"));
      const updated = item(dto.item);
      if (updated.id !== id || updated.readAt === null) return invalidResponse();
      return { item: updated, unreadCount: count(dto.unreadCount) };
    },
    async markAllNotificationsRead() {
      const dto = record(await request("/read-all", "POST"));
      return { updatedCount: count(dto.updatedCount), unreadCount: count(dto.unreadCount) };
    },
  };
}
