---
title: "notifications 인수·마감 수신자·원천 이벤트 통합"
status: "제안"
requested_by: "오민혁"
date: "2026-09-07"
affected_docs: [docs/domain/reference/prd-v6.4.md, docs/domain/api-spec/applications-notifications.md, .github/CODEOWNERS]
affected_features: [notifications, applications, project-management, contracts-payments, user-management]
---

# 스펙 변경 신청

## 배경 (왜 필요한가)

2026-09-07 오민혁 사용자가 notifications 범위 직접 구현을 요청했다. 다른 담당자의 로컬
작업 존재를 가정하지 않고 develop b945f7c의 빈 notifications 틀에서 필수 6종을 구현한다.
아래 공유 정책/통합 수정은 담당자 `features/notifications/` 밖이어서 이 PR에서 변경하지 않는다.

## 2026-09-08 회의 반영 상태

근거: 사용자가 제공한 `2026-09-08-team-meeting-simple.html`의 오늘 할 일(166–176행),
접점 이슈(218–221행), 내일 확인할 것(242–252행). 아래는 회의의 담당·일정이지 구현 완료 증거가 아니다.

- 부분 승인: 오민혁의 notifications API 4종(목록·안읽음 수·개별 읽음·전체 읽음) 진행.
- 진행 중: 수신자·이벤트 통합. 자연 마감 수신자 정책, 영속 재시도, 운영 배포 검증까지 승인·완료된
  것은 아니므로 이 CR 전체 상태는 `제안`으로 유지한다.

> **공유 담당표 갱신 완료 (2026-09-09, 팀장).** 나머지 항목(§2~5)은 여전히 열려 있다 —
> 아래는 이 CR이 명시적으로 요청한 "공유 담당표/계약 사본 갱신"(위 문단, line 25)만
> 반영한 것이다.
>
> - `docs/domain/erd.md` 담당자 표: `notifications`를 최윤석 → 오민혁으로 이동
> - `docs/domain/reference/erd-v1.4.dbml`: "축 3" 섹션 주석과 `notifications` 테이블
>   `[R]` 확인 요청자를 오민혁으로 갱신
> - `docs/domain/reference/prd-v6.4.md` §5.6, §11.4(§3.3.1·§3.3.2 행): "최윤석이
>   만듭니다" → 오민혁으로 정정 (§11.4의 §3.2.4 applications 행 4개는 최윤석 그대로 — 이건
>   notifications가 아니라 applications라서 건드리지 않았다)
> - `.github/CODEOWNERS`: `/features/notifications/` → `@dhalsgur13`(오민혁)
> - `docs/domain/api-spec/applications-notifications.md`는 이 저장소에 없어 대상 없음
>
> 근거: `features/notifications/spec.md:3` "담당자: 오민혁 · 2026-09-07 사용자 인수 요청
> 기준", task #185·#186(notifications #90 정독·반영, 이미 완료).

> **§1 상태 정정 (2026-09-09, 팀장).** 위 "이미 완료"는 부정확했다 — task #185·#186이 만든
> 커밋(`2e84aec`)은 `feature/user-management-notifications-ai-pricing-integration` 로컬
> 브랜치에만 있었고 `develop`에 merge되지 않아, 오늘까지 `app/`의 notifications는
> `.gitkeep`뿐이었다(사용자 문의로 발견). 오늘 그 커밋을 `feat/notifications-user-management-
> integration` 브랜치로 `origin/develop`에 cherry-pick·검증했다 — §1(조회/자기알림 관리 API
> 4종 + 웹 벨·목록 화면)은 이제 실제로 반영됐다(브랜치는 준비 완료, develop merge는 아직).
> §2~4(수신자 정책·원천 이벤트·자연 마감 게이트)는 이 커밋에도 없다 — 그대로 열려 있다.

| 담당 | 회의상 일정·몫 | 통합 인계 조건 |
|---|---|---|
| 오민혁 | 09-08 API 4종, 09-09 마감 연동 지원 | 인증된 API·저장/전달 포트·검증 결과 제공. 원천 상태·운영 scheduler를 대신 구현하지 않음 |
| 조준영 | 09-08 applications 이벤트의 clientId·freelancerId 보강 | 아래 §3의 안정적 사건 키·수신자 스냅샷·실패 ACK 계약까지 대조 요청 |
| 유동우 | 09-09 복귀 후 notifications §4 | 마감 scheduler·closure 사건·성공 후 표식·실패 재처리 연결 |
| 팀장 | app 통합·QA·공유 문서 반영 | DB/인증/라우터/공통 웹 연결, 수신자 정책·ID 길이 결정, 운영 완료 기준 확인 |

## 현재 스펙

- PRD §5.6: "알림은 전부 최윤석이 만듭니다." → 공유 담당표 갱신 확인 필요.
- 자연 마감 §2.3: "대기 중이던 지원자". §5.6 표: "지원자 전원".
- 알림 실패는 본 작업을 되돌리지 않으며, 마감 알림 지연은 최대 10분.
- D13: 알림 삭제 없이 최근 100건만 표시.

## 제안하는 변경

### 1. 담당·API 부분 승인과 남은 통합

회의에서 오민혁의 API 4종 진행은 승인됐다. 이 CR에서 applications 소유권을 임의 변경하지 않는다.
이 폴더 api-contract.md의 목록/미읽음/개별·전체 읽음 4개 API를 검토해 공유 사본·`app/`에 반영한다.
미읽음 badge 및 전체 읽음은 최신 100건 밖도 포함한다. 화면에 범위를 안내한다.

### 2. 마감 수신자 결정

더 구체적인 §2.3에 따라 마감 직전 PENDING 대상만 받는 것으로 잠정 구현한다.
09-08 회의 제공본에는 PENDING/지원자 전원 중 어느 쪽으로 확정했는지 없어 아직 정책 확인이 필요하다.
이미 거절된 지원자까지 포함하는 것으로 확정되면 producer의 recipientIds snapshot만 바꾸면 된다.
notifications 소비자가 변경 이후 application.status를 다시 읽어 대상을 복원하지 않는다.
취소는 명확한 PENDING + 선정 프리랜서 합집합을 유지한다.

### 3. 원천 이벤트·재시도 handoff

현재 코드 확인 기준: `origin/develop ec1c01f` (2026-09-08). 아래 파일/행은 이 커밋 기준이다.

| 현재 근거 | 필요한 변경·인계 |
|---|---|
| `app/server/src/features/applications/application.types.ts:296–308` — 이벤트는 type/projectId/applicationId/occurredAt, publish는 Promise<void> | eventId·projectTitle·clientId 또는 freelancerId를 정규화 입력에 보강. 사건 생성 시 검증한 수신자·제목·시각을 고정 |
| `app/server/src/features/applications/application.service.ts:446–468` — 지원 저장 후 발행 | 지원 생성과 사건 저장을 결합. 재요청·worker 재전달에도 최초 사건 키/시각 보존 |
| `app/server/src/features/applications/application.service.ts:226–235`, `:332–346`, `:357–365` — 발행 예외를 삼킨 뒤 CREATE_NOTIFICATIONS를 SUCCEEDED로 기록 | PR #83의 operation 기반 후처리는 추가됐지만 알림 실패 ACK는 아직 해결되지 않음. delivered(신규/중복 성공)만 완료, retry_required는 재전달 대상으로 유지 |
| `app/server/src/features/applications/application.service.ts:316–338` — 실행 시 PENDING을 변경한 뒤 지역 배열로 자동거절 대상 발행 | 변경 전 applicationId/freelancerId 스냅샷을 사건에 저장. 재실행 때 이미 REJECTED인 대상을 놓치지 않도록 현재 PENDING 목록으로 복원하지 않음 |
| `app/server/src/features/applications/applications-port.adapter.ts:31–73` — closureEventId/reason은 받지만 발행 시 소실되고 마감/취소 모두 APPLICATION_AUTO_REJECTED | 별도 PROJECT_RECRUITMENT_CLOSED/PROJECT_CANCELED 사건 전달. 대기 지원자가 없어도 취소된 선정자가 있으면 알림 생성. 같은 closure의 자동거절 알림은 중복 생성하지 않음 |
| `app/server/src/express-app.ts:259–261`, `:345–354` — 메모리 발행 port 연결 | 정규화된 지원/closure 사건을 notifications adapter에 연결. 기존 메모리 로그를 실제 알림 저장으로 간주하지 않음 |

인증된 조립 지점의 좁은 delegate에서 `applicationRepository.getApplication/getByProject`
(`app/server/src/features/applications/in-memory-application.repository.ts:27–33`)로 소속 projectId와
freelancerId를 확인할 수 있다. clientId/acceptedApplicationId는
`app/server/src/features/project-management/project-contract.service.ts:111–123`, title은
`app/server/src/features/project-management/project-read.service.ts:105`의 조회 접점이다.
다른 feature를 직접 import하지 않으며, worker 재시도마다 이 조회로 사건 스냅샷을 바꾸지 않는다.

도메인 커밋과 안정적인 사건 기록(outbox)을 결합한다. 본 작업은 롤백하지 않고 부분 생성 실패는
같은 키로 재전달한다. 재시도 상한·실패 보관·관측을 두고, 실패를 성공 ACK로 바꾸지 않는다.
`app/server/src/features/applications/in-memory-application.repository.ts:19–23`의 operation/closure도
휘발성이므로 이 코드나 notifications Mock만으로 재시작·다중 인스턴스 전달 보장을 주장하지 않는다.

### 4. 자연 마감 운영 게이트

- 유동우의 09-09 담당 작업이며 오민혁은 전달 포트 연동을 지원한다.
- `app/server/src/features/project-management/project-read.service.ts:70–81`은 표시만 CLOSED로 보정한다. 사용자 조회와 무관한
  능동 scheduler가 필요하다. 기존 사용자 소유자 인증 경로를 서비스용 공개 우회 경로로 열지 않는다.
- `app/server/src/features/project-management/project.service.ts:613–628`은 알림 성공 전에
  deadlineNotifiedAt을 채우며 `:599–609`는 이미 CLOSED이면 후처리를 건너뛴다.
  안정적 closureEventId/수신자 스냅샷을 먼저 보존하고 전달/ACK 성공 후 표식을 기록한다.
  CLOSED/CANCELED 상태여도 미전달 사건은 worker가 재처리할 수 있어야 한다.
- scheduler 간격+재시도 지연을 합쳐 deadline→알림 저장 10분 이내임을 운영 환경에서 검증한다.

### 5. 공통 식별자 길이 블로커

`app/server/src/features/user-management/auth.service.ts:243`의 기본 사용자 ID 생성은
`usr_` + UUID 32자리로 36자다. `app/server/prisma/schema.prisma:325`의 User.id와 `:603`의
Notification.recipientId는 varchar(30)이며 현재 알림 내부 ID 계약도 최대 30자다.
실제 계정으로 연결하기 전에 팀장이 생성 규칙/기존 데이터/스키마 정책을 맞춰야 한다.
알림에서 ID를 자르거나 임의 매핑하지 않는다. 이번 담당 범위에서 인증 코드·스키마를 바꾸지 않는다.

프로젝트에도 같은 문제가 있다. `app/server/src/express-app.ts:186–187`의 randomId는 32자이며
`:267`의 newProjectId는 `prj_`를 붙여 36자가 된다. 알림 projectId/linkUrl/resourceId 계약은
최대 30자이므로 사용자 ID만 맞춰도 해결되지 않는다. 실제 생성 프로젝트 ID까지 함께 점검한다.

### 6. 선택 알림 7종은 이번 범위로 확대하지 않는다

enum 13값 중 필수 6종만 생성한다. 나머지 AGREEMENT_ACCEPTED/AGREEMENT_REJECTED/CONTRACT_SIGNED/
PAYMENT_COMPLETED/DELIVERY_REQUESTED/DELIVERY_APPROVED/REVIEW_REQUESTED는 타입 호환성만 유지한다.

`app/server/src/features/contracts-payments/notification.port.ts:12–54`에는 뒤 4종 포트가 있지만
eventId/projectTitle은 없다. 납품 발행(`public-api.service.ts:915–922`, `:965–972`)과 리뷰 요청
(`project-transaction.service.ts:105–114`)은 실제 호출되므로 기존 포트를 필수 6종 소비자에
무조건 연결하지 않는다. 이 세 파일은 모두 `app/server/src/features/contracts-payments/` 아래다.
선택 알림까지 요구되면 별도 범위·사건 계약·테스트 승인 후 연결한다.

`app/server/src/express-app.ts:432–444`의 contracts 알림도 메모리 로그다.
`app/server/src/features/contracts-payments/outbox-lease.ts:34`에 메모리 outbox 정의는 있으나
현재 `app/server/src`에서 사용 지점은 확인되지 않았다. 이를 운영 재전달 완료 근거로 쓰지 않는다.

## 영향 범위

팀장: app server 인증 resolver·DB repository(기존 Notification 모델 unique dedupeKey 활용),
라우터·에러·CORS 정책·웹 `/notifications` 및 공통 헤더 배지 연결, 공유 문서/담당표 반영.
applications(조준영)/project-management(유동우): §3–4의 수신자·변경 전 snapshot·사건 키·능동 마감·ACK 통합 요청.
운영: 저장 내구성·worker 재시작·다중 인스턴스 재전달·10분 SLA 검증.
user-management/팀장: 공통 ID 길이 정책 확인. contracts-payments 선택 알림 생성은 이번 범위 밖.
REVIEW_CREATED 평점 캐시는 user-management의 별개 책임으로 이번 연결에 포함하지 않는다.

## 대안으로 검토했던 것

- 현재 AUTO_REJECTED를 그대로 구독: 마감/취소를 다른 선정으로 잘못 알리고 선정자 취소 알림을 누락해 기각.
- 목록 조회 시 마감 검사: 아무도 조회하지 않으면 10분 요구를 지키지 못해 기각.
- 메모리 retry queue만으로 운영 완료 선언: 재시작·서버리스 다중 인스턴스에서 유실되어 기각.
- notifications가 다른 기능 상태·스키마를 직접 수정: 담당 경계를 넘어 이 PR에서는 하지 않는다.
