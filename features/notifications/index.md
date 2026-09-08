# notifications Index

담당자: **오민혁** — 2026-09-08 회의상 API 4종 담당 승인. 공유 담당표 반영은 CR-0001 참조.
통합 준비 기준: develop `ec1c01f`; 작업 브랜치 `feature/notifications`.
기존 구현 PR #75는 develop 병합됨. 이것은 app/DB/운영 스케줄러 통합 완료를 의미하지 않는다.

## 범위와 파일

- `spec.md`: 필수 6종 인앱 알림·조회·읽음·중복 방지와 통합 접점의 번호 규칙 20개.
- `api-contract.md`: 목록/미읽음/개별 읽음/전체 읽음 HTTP와 내부 event snapshot 계약.
- `design/high-fi.html`: 공통 browse 레퍼런스와 토큰을 적용한 인터랙티브 시안, 필수 요소 목록.
- `prototype/server/`: service/controller/인증 resolver 주입 router/저장소 port.
- `prototype/server/notification.module.ts`: 같은 저장소를 쓰는 router + 안전 전달 port 조립.
- `prototype/mock/`: 원자적 in-memory 저장소와 브라우저 전용 가상 API. 운영 데이터로 쓰지 않는다.
- `prototype/web/`: 목록 페이지·배지·상태 제어·인증 토큰 주입 HTTP client·공통 preview 진입점.
- `prototype/web/api/notifications.ts`: 공용 request 주입 `createNotificationApi`와 독립 HTTP adapter.
- `prototype/tests/`, `prototype/run.tsx`: 규칙·HTTP·클라이언트·SSR 검증.
- `test-report.md`: 실제 검증 결과·QA 플로우·남은 운영 게이트.
- `change-requests/CR-0001-notifications-integration.md`: 담당표·마감 수신자 결정·upstream 사건·scheduler 통합 요청.

## 실행

저장소 루트에서:

```sh
npx tsx features/notifications/prototype/run.tsx
npx tsc -p features/notifications/prototype/tsconfig.json
npm run preview:dev
```

공통 프리뷰의 notifications를 선택하거나 `/?feature=notifications`로 접근한다.
가상 사용자·실패 상태 전환은 feature preview에만 있고 실제 인증을 대신하지 않는다.
화면 전체 폭으로 보려면 같은 Vite 서버의 `/@fs/<저장소 절대경로>/features/notifications/prototype/preview.html`
을 연다. 새 기능 entry가 목록에 보이지 않으면 Vite를 재시작한다(최초 glob 탐색 갱신).

## 팀장 통합 순서

구체적인 서버/웹 조립 예시는 `api-contract.md`의 "통합 조립 계약"을 따른다.

1. API 4종 담당 진행은 회의 승인됨. CR-0001의 공유 사본 반영·마감 수신자·ID 길이 충돌 확인.
2. 기존 Notification Prisma 모델에 NotificationRepository adapter 구현. 각 결과+count는
   단일 transaction snapshot, dedupeKey는 DB unique insert. Mock 메모리는 배포용이 아니다.
3. `createNotificationModule({ repository, resolveAuth })`의 router를 `app.use(router)`로
   전역 JSON parser보다 먼저 연결한다. 전체 `/api/v1/notifications` 경로 포함.
   resolver는 기존 access token 검증 결과만 반환하며, 잘못된 body도 인증을 먼저 확인한다.
4. 원천의 안정적인 사건 키·수신자 스냅샷을 받아 생성 port에 연결. 성공 도메인 작업을 알림
   실패로 되돌리지 않는다. retry_required는 실패를 기록하고 재전달해야 한다는 신호이지 성공 ACK가 아니다.
5. 웹 `/notifications` placeholder 교체. 공용 HTTP 주입 및 AppShell/HomeHeader/목록의
   단일 snapshot 연결. 인증 bootstrap·계정 전환·401·URL 중복 접두사·응답200 검증.
6. 능동 마감 worker·durable retry·성공 이후 deadlineNotifiedAt 기록 후 통합 E2E/SLA 확인.

## 전달용 요약

> notifications API 4종 통합 준비를 최신 develop 기준으로 보완했습니다. 서버는 저장소·실인증
> resolver를 주입하는 조립 함수, 웹은 공용 HTTP 오류를 정규화하는 접점을 제공합니다.
> 조준영님께는 안정적인 eventId·수신자·제목 snapshot과 알림 성공 ACK, 유동우님께는 9/9
> 능동 마감·closure snapshot·전달 성공 후 deadlineNotifiedAt 처리를 요청드립니다.
> 팀장님은 DB/실인증/웹 공통 상태를 연결하고 ID 생성36자/스키마30자 충돌을 먼저 확인해 주세요.
> app/·공유 스키마는 이번에 수정하지 않았으며, 선택 알림 7종·REVIEW_CREATED 평점 캐시는 별개입니다.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-07 | 빈 notifications 틀에서 필수 MVP 담당 구현 및 통합 요청 작성 |
| 2026-09-08 | 최신 develop 기준 서버 조립·공용 HTTP 접점·loopback 연동 QA·통합 handoff 보완 |
