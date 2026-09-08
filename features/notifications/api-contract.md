# notifications — API 계약

상태: 2026-09-07 담당자 구현안. 공유 API 정본 및 `app/` 반영 전 팀장 검토 필요.
관련 규칙: `spec.md` 1–18. Base path `/api/v1/notifications`.

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
