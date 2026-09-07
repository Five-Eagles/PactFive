# notifications Index

담당자: **오민혁** — 2026-09-07 사용자 인수 요청. 공유 담당표 변경은 CR-0001 참조.
기준: develop `b945f7c`; 작업 브랜치 `feature/notifications`.

## 범위와 파일

- `spec.md`: 필수 6종 인앱 알림·조회·읽음·중복 방지의 번호 규칙 18개.
- `api-contract.md`: 목록/미읽음/개별 읽음/전체 읽음 HTTP와 내부 event snapshot 계약.
- `design/high-fi.html`: 공통 browse 레퍼런스와 토큰을 적용한 인터랙티브 시안, 필수 요소 목록.
- `prototype/server/`: service/controller/인증 resolver 주입 router/저장소 port.
- `prototype/mock/`: 원자적 in-memory 저장소와 브라우저 전용 가상 API. 운영 데이터로 쓰지 않는다.
- `prototype/web/`: 목록 페이지·배지·상태 제어·인증 토큰 주입 HTTP client·공통 preview 진입점.
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

1. CR-0001의 공유 담당자·마감 수신자 정책·API 승인.
2. 기존 Notification Prisma 모델에 NotificationRepository adapter 구현. 각 결과+count는
   단일 transaction snapshot, dedupeKey는 DB unique insert. Mock 메모리는 배포용이 아니다.
3. `createNotificationRouter(service, resolveAuth)`는 전체 `/api/v1/notifications` 경로를
   포함하므로 `app.use(router)`로 연결한다. resolver는 기존 access token 검증 결과만 반환한다.
   라우터는 인증 후 자체 JSON 파싱한다. 상위 parser가 먼저 실행되면 malformed body의 인증 우선
   오류 응답 정책이 달라질 수 있으므로 앱 통합 시 재검증한다.
4. 원천의 안정적인 사건 키·수신자 스냅샷을 받아 생성 port에 연결. 성공 도메인 작업을 알림
   실패로 되돌리지 않는다. retry_required는 실패를 기록하고 재전달해야 한다는 신호이지 성공 ACK가 아니다.
5. 웹 `/notifications` placeholder 교체, 공통 헤더 배지 연결, 실인증 session key/API 주입.
6. 능동 마감 worker·durable retry·성공 이후 deadlineNotifiedAt 기록 후 통합 E2E/SLA 확인.

## 전달용 요약

> notifications 필수 6종 인앱 알림, 조회·미읽음 배지·개별/전체 읽음, 수신자별 dedupe와
> 실패 재전달 포트의 담당 기능 구현을 준비했습니다. app/·공유 스키마는 수정하지 않았습니다.
> 통합 시 (1) DB/실인증·웹 라우트 연결 (2) applications 사건 키·수신자/마감취소 reason 전달
> (3) 능동 마감 scheduler와 durable retry, 성공 후 deadlineNotifiedAt 기록이 필요합니다.
> 마감 수신자 범위는 PRD §2.3(PENDING)과 §5.6(지원자 전원)이 달라 CR-0001에 확인 요청했습니다.
> REVIEW_CREATED 평점 캐시는 이번 알림 범위에 포함하지 않았습니다.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-07 | 빈 notifications 틀에서 필수 MVP 담당 구현 및 통합 요청 작성 |
