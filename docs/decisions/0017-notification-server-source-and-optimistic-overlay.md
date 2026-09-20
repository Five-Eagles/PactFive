# 0017. 알림 원본 데이터와 optimistic UI 분리

상태: 팀장 결정  
작성일: 2026-09-14  
적용 범위: `app/web/src/features/notifications`

## 결정

실제 알림은 서버 알림 저장소를 유일한 원본으로 둔다. 웹의 optimistic 상태는 읽음 처리처럼 사용자의 액션에 대한 임시 화면 상태로만 유지하고, 별도의 더미 알림 목록을 실제 목록과 합쳐 저장하지 않는다.

## 이유

실제 데이터와 더미 데이터를 이중 저장하면 중복 알림, 잘못된 unread count, 세션 간 잔존 데이터가 생긴다. 반면 optimistic overlay는 서버 응답 전까지 빠른 피드백을 주고, 성공 시 서버 응답으로 대체하며 실패 시 이전 상태로 되돌릴 수 있다.

## 상태 규칙

- `items`, `unreadCount`: 서버가 확정한 값
- `optimisticReadIds`: 현재 요청 중 화면에만 적용한 읽음 상태
- 읽음 요청 성공: 서버 응답의 item/count로 대체
- 읽음 요청 실패: 요청 전 snapshot으로 rollback
- 새로고침·세션 변경: optimistic 상태를 폐기하고 서버 목록으로 재동기화

## 더미 데이터 사용 범위

발표·QA용 더미 알림이 필요하면 `VITE_NOTIFICATION_DEMO=true`인 별도 adapter에서만 제공한다. 운영 기본값은 false이며, 더미 데이터에는 `demo-` 접두사 ID와 `isDemo` 표시를 사용한다. 이 데이터는 서버 API에 전송하거나 unread count에 섞지 않는다.

## 연결 지점

기능 서버는 이미 `NotificationDeliveryPort`로 사건을 발행한다. applications와 contracts-payments는 사건 발생 후 서버 알림을 생성하고, 웹은 `/api/v1/notifications`를 조회한다. UI 액션은 optimistic overlay를 거친 뒤 반드시 서버 응답으로 확정한다.

