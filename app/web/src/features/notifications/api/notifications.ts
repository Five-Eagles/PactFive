import { http, ApiError } from '../../../shared/http';
import { NOTIFICATION_TYPES } from '../notifications.types';
import type {
  NotificationApi,
  NotificationItem,
  NotificationListResponse,
  NotificationType,
} from '../notifications.types';

/**
 * 원본: features/notifications/prototype/web/api/notifications.ts (오민혁, PR #75/#90)의
 * `createNotificationApi` 부분을 재해석했다 — DTO 파싱/검증은 그대로 옮기고, 자체
 * `NotificationApiError`/`createNotificationHttpApi`(독립 preview용)는 앱에서 쓰지 않아 뺐다.
 * `shared/http.ts`의 `ApiError`를 그대로 감지해 401/404/그 외를 구분한다(app/web/AGENTS.md
 * "폴더 간 접점" — fetch 직접 호출 없이 공용 http만 거친다).
 */

const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,29}(?![\s\S])/;
export function isNotificationProjectLink(value: string): boolean {
  return /^\/projects\/[A-Za-z0-9][A-Za-z0-9_-]{0,29}(?![\s\S])/.test(value);
}

export class NotificationClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationClientError';
  }
}

function invalidResponse(): never {
  throw new NotificationClientError(502, 'INVALID_RESPONSE', '알림 응답을 확인할 수 없습니다. 다시 시도해 주세요.');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalidResponse();
  return value;
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) return invalidResponse();
  return value;
}
function timestamp(value: unknown): string {
  const result = string(value, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    return invalidResponse();
  return result;
}
function nullableIdentifier(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !identifier.test(value)) return invalidResponse();
  return value;
}
function item(value: unknown): NotificationItem {
  const dto = record(value);
  const id = nullableIdentifier(dto.id);
  if (id === null || !NOTIFICATION_TYPES.includes(dto.type as NotificationType)) return invalidResponse();
  if (typeof dto.linkUrl !== 'string' || !isNotificationProjectLink(dto.linkUrl)) return invalidResponse();
  // 명시적 allowlist — 내부 recipientId/dedupeKey는 UI 상태로 절대 새지 않는다.
  return {
    id,
    type: dto.type as NotificationType,
    title: string(dto.title, 100),
    body: string(dto.body, 500),
    linkUrl: dto.linkUrl,
    resourceType: nullableIdentifier(dto.resourceType),
    resourceId: nullableIdentifier(dto.resourceId),
    readAt: dto.readAt === null ? null : timestamp(dto.readAt),
    createdAt: timestamp(dto.createdAt),
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

function normalizeTransportError(error: unknown): NotificationClientError {
  if (error instanceof NotificationClientError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401) return new NotificationClientError(401, 'UNAUTHORIZED', '세션이 만료되었습니다. 다시 로그인해 주세요.');
    if (error.status === 404)
      return new NotificationClientError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
    return new NotificationClientError(
      error.status,
      error.status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      '알림을 처리하지 못했습니다. 다시 시도해 주세요.',
    );
  }
  return new NotificationClientError(0, 'NETWORK_ERROR', '연결을 확인한 후 다시 시도해 주세요.');
}

const NOTIFICATION_COLLECTION_PATH = '/v1/notifications';

/**
 * `shared/http.ts`가 이미 base URL(`/api`)·인증 헤더·전역 401 처리를 담당한다 — 여기서는 경로만
 * 조립한다. `http.get`/`http.post`는 성공 시 파싱된 JSON 본문을 그대로 돌려주므로 서버 DTO
 * 검증은 위 `list`/`item` 함수가 담당한다.
 */
export function createNotificationApi(): NotificationApi {
  async function request(suffix: string, method: 'GET' | 'POST'): Promise<unknown> {
    try {
      return method === 'GET'
        ? await http.get<unknown>(`${NOTIFICATION_COLLECTION_PATH}${suffix}`)
        : await http.post<unknown>(`${NOTIFICATION_COLLECTION_PATH}${suffix}`);
    } catch (error) {
      throw normalizeTransportError(error);
    }
  }
  return {
    async getNotificationList() {
      return list(await request('', 'GET'));
    },
    async getUnreadCount() {
      return { unreadCount: count(record(await request('/unread-count', 'GET')).unreadCount) };
    },
    async markNotificationRead(id) {
      if (!identifier.test(id)) throw new NotificationClientError(400, 'VALIDATION_ERROR', '올바른 알림을 선택해 주세요.');
      const dto = record(await request(`/${id}/read`, 'POST'));
      const updated = item(dto.item);
      if (updated.id !== id || updated.readAt === null) return invalidResponse();
      return { item: updated, unreadCount: count(dto.unreadCount) };
    },
    async markAllNotificationsRead() {
      const dto = record(await request('/read-all', 'POST'));
      const unreadCount = count(dto.unreadCount);
      if (unreadCount !== 0) return invalidResponse();
      return { updatedCount: count(dto.updatedCount), unreadCount };
    },
  };
}
