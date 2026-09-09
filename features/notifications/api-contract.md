# notifications — API 계약

상태: 2026-09-08 회의상 API 4종 진행 승인. 공유 API 정본 및 `app/` 실제 반영은 별도.
관련 규칙: `spec.md` 1–20. Base path `/api/v1/notifications`.

## 공통

- 활성 사용자 인증 필수. `Authorization: Bearer <accessToken>`을 기존 auth middleware에서
  검증한 뒤 `{ userId, isActive: true }`를 주입한다. 라우터 자체가 토큰을 발급/추측하지 않는다.
- 모든 응답 `Cache-Control: no-store`. recipientId/userId를 받는 공개 API는 없다.
  아래 API는 query를 받지 않으며 body는 없음 또는 빈 객체다. 추가 필드는 400.
- 인증 실패 401 `UNAUTHORIZED`, 잘못된 요청 400 `VALIDATION_ERROR`,
  남의 알림/없는 알림 동일 404 `NOTIFICATION_NOT_FOUND`, 저장 실패 500 `INTERNAL_ERROR`.
- 에러 형식: `{ "error": { "code": "UNAUTHORIZED", "message": "로그인이 필요합니다." } }`.
  내부 오류·토큰·수신자 존재 여부를 응답에 포함하지 않는다.

## GET /api/v1/notifications

요청: query/body 없음. 최신 100건 고정, 생성 시각 내림차순·동률 id 내림차순.

응답 200 (`NotificationListResponse`):

```json
{
  "items": [{
    "id": "ntf_example001", "type": "APPLICATION_SUBMITTED",
    "title": "새로운 지원이 도착했습니다", "body": "브랜드 웹사이트 프로젝트의 지원 내용을 확인해 주세요.",
    "linkUrl": "/projects/prj_example001", "resourceType": "application", "resourceId": "apl_example001",
    "readAt": null, "createdAt": "2026-09-07T03:00:00.000Z"
  }],
  "unreadCount": 1,
  "limit": 100
}
```

`unreadCount`는 100건 밖 포함 전체 미읽음 수다. 조회는 읽음 상태를 변경하지 않는다.
빈 결과는 `{ "items": [], "unreadCount": 0, "limit": 100 }`.

## GET /api/v1/notifications/unread-count

요청: 없음. 응답 200 (`NotificationUnreadCountResponse`): `{ "unreadCount": 1 }`.
헤더 배지를 위한 독립 조회. polling/SSE/실시간 갱신 주기는 이번 계약에 포함하지 않는다.

## POST /api/v1/notifications/:notificationId/read

요청 body: 없음 또는 `{}`. 응답 200 (`ReadNotificationResponse`):

```json
{
  "item": {
    "id": "ntf_example001", "type": "APPLICATION_SUBMITTED",
    "title": "새로운 지원이 도착했습니다", "body": "브랜드 웹사이트 프로젝트의 지원 내용을 확인해 주세요.",
    "linkUrl": "/projects/prj_example001", "resourceType": "application", "resourceId": "apl_example001",
    "readAt": "2026-09-07T03:05:00.000Z", "createdAt": "2026-09-07T03:00:00.000Z"
  },
  "unreadCount": 0
}
```

최초 서버 읽음 시각 보존. 반복 성공. 다른 수신자/없는 ID는 동일 404.

## POST /api/v1/notifications/read-all

요청 body: 없음 또는 `{}`. 응답 200 (`ReadAllNotificationsResponse`):
`{ "updatedCount": 7, "unreadCount": 0 }`.

원자적 실행 시점 본인 미읽음 전체를 변경한다(최근 100건 밖 포함).
반복 실행은 updatedCount 0. 완료 후 도착한 알림은 미읽음이다.
공유 DB adapter는 범위 갱신과 응답 count에 일관된 transaction snapshot을 사용한다.

## 내부 이벤트 계약 (HTTP로 공개하지 않는다)

타입 정본은 `prototype/server/notification.types.ts`의 `NotificationEventInput`.
공통: 안정적인 `eventId`, `projectId`, 1–100자 `projectTitle`, UTC ISO `occurredAt`.
시각을 임의 재생성하지 않고 재시도에도 같은 사건 식별자·수신자 스냅샷을 전달한다.

| type | 추가 입력 | 수신자 |
|---|---|---|
| APPLICATION_SUBMITTED | applicationId, clientId | 의뢰인 |
| APPLICATION_ACCEPTED | applicationId, freelancerId | 선정 프리랜서 |
| APPLICATION_REJECTED | applicationId, freelancerId | 직접 미선정 프리랜서 |
| APPLICATION_AUTO_REJECTED | applicationId, freelancerId | 다른 지원자 선정으로 미선정된 사람 |
| PROJECT_RECRUITMENT_CLOSED | closureEventId, recipientIds | 원천이 확정한 마감 수신자 스냅샷 |
| PROJECT_CANCELED | closureEventId, pendingFreelancerIds, acceptedFreelancerId (nullable) | 대기+선정 합집합 |

수신자 ID와 리소스 ID는 서버 검증된 1–30자 식별자다. 공백/경로 구분자는 허용하지 않는다.
eventId/closureEventId는 안정적인 1–120자 키다. closure 종류는 closureEventId가 dedupe 원천이다.
`publishEvent(input)`는 `{ createdCount, duplicateCount }`를 반환하며 잘못된 입력은 거부한다.
`deliverNotificationEventSafely(input)`는 성공 시 `{ status: "delivered", createdCount, duplicateCount }`,
실패 시 `{ status: "retry_required" }`를 반환한다. 호출자는 실패를 성공으로 ACK하지 않는다.
정상 도메인 transaction 완료 후 호출하고 실패는 재전달 대상으로 유지한다.

문구·linkUrl은 서버 템플릿으로 생성한다. 링크는 현재 공개 라우트 `/projects/:projectId`이며,
상세 화면 자체가 최신 상태·권한·삭제된 리소스를 처리한다. 세부 지원 탭 deep-link는 새로 만들지 않는다.
resourceType/resourceId는 사건 발생 리소스를 기록하며 별도 FK를 요구하지 않는다.

## DTO 및 통합 한계

`NotificationItem`, `NotificationListResponse`, `NotificationUnreadCountResponse`,
`ReadNotificationResponse`, `ReadAllNotificationsResponse`, `NotificationApi`는 types.ts를 참조한다.
DB 내부 `recipientId`, `dedupeKey`는 DTO에서 제외한다.

필수 6종 이외 enum 7종은 타입 호환성만 유지하고 이번 이벤트 생성은 거부한다.
REVIEW_CREATED는 평점 cache 구독이며 알림 enum이 아니다.

현재 app applications 이벤트에는 eventId·수신자·closure reason이 부족하다.
그 이벤트에 무조건 연결하지 말고 CR-0001의 normalized event/ACK 계약을 먼저 반영한다.
Mock은 프로세스 재시작 시 사라진다. 운영 중복 방지는 DB unique insert,
실패 복구는 durable outbox/worker, 10분 보장은 능동 scheduler 통합 검증이 필요하다.

## 통합 조립 계약 (2026-09-08)

### 서버: 같은 저장소에 조회와 생성 연결

`prototype/server/notification.module.ts`의 `createNotificationModule`은 다음 두 접점을 반환한다.

```ts
const notifications = createNotificationModule({
  repository: notificationRepository, // 팀장 구현 DB adapter. Mock 자동 선택 없음
  resolveAuth: resolveNotificationAuth, // 기존 authService가 검증한 users.id와 활성 여부
});
app.use(notifications.router); // 전체 /api/v1/notifications 경로 포함, prefix를 더 붙이지 않음
// 원천 도메인 커밋 후, 저장해 둔 정규화 사건을 내부 worker가 전달한다.
const delivery = await notifications.delivery.deliverNotificationEventSafely(savedEvent);
// delivered만 ACK. retry_required이면 원천 사건/수신자를 보존한 채 후속 재시도 대상 유지.
```

위 이름 중 repository/resolver/savedEvent는 **통합자가 제공할 의존성**이며 이 PR에서 실제 DB나
worker를 제공하는 것이 아니다. 토큰에서 userId를 직접 decode하거나 임의 헤더를 인증으로
사용하지 않는다. 앱의 현재 전역 `express.json()`보다 알림 라우터를 먼저 배치해야 잘못된
JSON에서도 인증 우선 401과 인증 후 400을 유지한다. 다른 경로의 parser 순서는 보존한다.
유효하지 않은 원천 사건도 retry_required다. 무한 재시도 대신 원천 검증·시도 상한·실패 보관은
worker 책임이다. 생성 API는 HTTP로 노출하지 않는다.

### 웹: 공용 HTTP 계층에 JSON request 주입

`prototype/web/api/notifications.ts`의 `createNotificationApi({ request })`는 네 경로와 DTO
검증만 담당한다. request는 `(path, { method }) => Promise<unknown>`이며 성공 JSON을 반환하고
실패 시 공용 오류를 던진다. 별도 토큰 공급자나 fetch를 앱 기능에 새로 만들 필요가 없다.

```ts
// 팀장이 app/web 기능 API에 적용할 조립 예시. prototype에서 app 파일을 import하지 않는다.
const notificationApi = createNotificationApi({
  request: (path, { method }) => {
    const relativePath = path.slice('/api'.length); // /api/v1/... → /v1/...
    return method === 'GET'
      ? http.get<unknown>(relativePath)
      : http.post<unknown>(relativePath);
  },
});
```

현재 `shared/http.ts`는 base URL에 `/api`를 포함한다. 전체 `/api/v1/...`를 그대로 넘겨
`/api/api/v1/...`로 만들지 않는다. 배포 VITE_API_BASE_URL 설정도 기존 앱과 같은 기준이다.
인증 헤더/쿠키/전역 401 처리/CORS는 공용 계층을 유지한다. 숫자 status가 있는 외부 오류는
알림 오류로 정규화하고 raw message/body는 화면에 전달하지 않는다. 401은 store의 세션 만료
처리로 목록·개수를 제거한다. 공용 request는 응답 status를 숨기므로 **정확한 200 확인은
주입 transport의 책임**이다. 기존 공용 http는 모든 2xx를 허용한다는 차이가 남아 있으므로
앱 통합 QA에서 201/202 응답이 성공으로 수용되지 않는지 확인하거나 공용 계층에 status 검증을
추가해야 한다. 독립 preview/test용 `createNotificationHttpApi`는 계속 정확한 200을 검증한다.

### 웹 상태와 화면 연결

- 인증 bootstrap 중/비로그인은 sessionKey null. 활성 세션은 access token이 아닌
  `user.id + sessionId`에 기반한 안정적인 키를 사용한다. 같은 계정 재로그인도 새 키여야 한다.
- 토큰 갱신 때마다 API 객체를 새로 만들지 않는다. 계정 변경 시 hook이 새 store를 선택하고
  이전 요청 결과를 무시한다. 기존 공용 401 handler를 덮어쓰지 않는다.
- 공통 조립 지점에서 `useNotifications(api, sessionKey)` **한 번** 호출하고 반환 snapshot을
  헤더 `NotificationBell`과 `/notifications`의 `NotificationListView`에 같이 전달한다.
  `NotificationListPage`를 별도로 마운트하면 독립 store가 생기므로 이 조립에서는 쓰지 않는다.
- 헤더 Bell에는 `href="/notifications"`를 명시한다. 기본 href는 페이지 내부 heading용이다.
  AppShell 밖의 HomeHeader에도 같은 상태를 내려야 한다. 알림 CSS도 페이지 진입 전부터
  헤더에 적용되어야 하며 `prototype/web/index.tsx`의 Mock preview는 app으로 옮기지 않는다.
- `/notifications` placeholder/ComingSoonOverlay를 기능 라우트로 교체하고 등록 정본 및
  로그인 returnTo 허용 경로는 팀장이 검토한다. 화면 표현 재설계는 이번 변경 범위가 아니다.

원천별 최신 조립 위치, ID 36자/30자 충돌, 아직 승인되지 않은 마감 수신자 정책과 운영 ACK는
`change-requests/CR-0001-notifications-integration.md`를 따른다.
