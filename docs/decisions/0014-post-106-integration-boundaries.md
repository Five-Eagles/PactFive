# PR #106 이후 통합 경계 및 팀장 의사결정

| 항목 | 내용 |
|---|---|
| 상태 | 1단계 구현 진행 — 트랜잭션 경계·운영 트리거 확정 대기 |
| 기준 | `origin/develop` PR #106 (`5278c58`)까지 |
| 작성일 | 2026-09-10 |
| 목적 | 기능 담당자의 도메인 구현을 다시 요구하지 않고, `app/` 조립·운영·E2E에 필요한 연결 결정을 고정한다 |

## 1. 결정 범위

이 문서는 기능 담당자의 내부 구현을 평가하거나 재작업을 지시하는 문서가 아니다. PR #106까지 확정된 포트와 서비스를 실제 애플리케이션 실행 경로에 연결할 때 팀장만 결정해야 하는 항목을 기록한다.

기능 담당자 영역은 그대로 둔다.

- 도메인 규칙과 상태 전이의 세부 구현
- 기능 내부 repository·service·화면 컴포넌트
- 기능 단위 테스트와 prototype 검증

팀장 통합 영역은 다음으로 한정한다.

- `app/server/src/express-app.ts`의 의존성 조립
- 기능 간 포트·어댑터 호출 시점
- Prisma/인메모리 실행 모드와 배포 설정
- Vercel Cron·내부 서비스 토큰 같은 외부 트리거
- 공통 오류·알림·라우팅·E2E 통과 기준

## 2. PR #106까지 확인된 연결 상태

### 2.1 지원 건수 포트

PR #106은 project-management에 `bumpApplicationCounts(projectId, delta)`를 열고, applications가 사용할 `ProjectApplicationContextPort`와 어댑터를 연결했다.

확정된 의미는 다음과 같다.

- 지원 생성: `applicationCount +1`, `pendingApplicationCount +1`
- 개별 직접 거절: `pendingApplicationCount -1`
- 수락·마감·취소: project-management가 남은 대기 건수를 `0`으로 정리
- `applicationCount`는 누적 건수이므로 감소하지 않음
- 두 번 거절되어도 대기 건수는 음수가 되지 않음

applications 서비스의 생성·개별 거절 경로는 이 포트를 호출하도록 `app/`에 연결한다. 수락·마감·취소 경로에서 다시 감소시키면 이중 차감이 되므로 호출하지 않는다. 남은 팀장 결정은 이 호출과 지원 행 저장을 어떤 Prisma 트랜잭션 경계로 묶을지다.

권장 결정: 지원 행 저장과 프로젝트 건수 갱신을 같은 Prisma `$transaction` 경계에 둔다. 현재 1단계 코드는 포트 호출 지점을 연결한 상태이며, 트랜잭션 어댑터를 도입하기 전까지는 이 경계를 운영 완료로 간주하지 않는다. 인메모리 모드도 같은 호출 순서를 유지해 QA 결과가 실행 모드에 따라 달라지지 않게 한다.

### 2.2 마감 스윕

PR #106은 `POST /internal/v1/projects/sweep-deadlines`와 `deadline-sweep.service.ts`를 추가했다. 서비스는 요청 시 한 번 실행되며, 프로세스 내부 타이머를 사용하지 않는다.

따라서 기능 구현은 끝났고, **배포 환경에서 누가 언제 이 엔드포인트를 호출할지**가 팀장 결정 사항이다.

권장 결정:

- Vercel Cron을 운영 트리거로 사용한다.
- 내부 라우트는 `INTERNAL_SERVICE_TOKEN`으로 보호한다.
- 호출 주기는 1시간 이내로 두고, 멱등 실행을 전제로 한다.
- Cron 실패는 로그·모니터링에서 확인할 수 있도록 응답의 처리 건수와 실패 목록을 보존한다.
- 로컬 QA는 같은 엔드포인트를 수동 호출해 검증한다.

타이머를 `app/server`에 다시 넣지 않는다. Vercel 서버리스에서 프로세스 생명주기에 의존하기 때문이다.

### 2.3 알림 API와 생산자

PR #101까지 알림 목록·미읽음 수·단건 읽음·전체 읽음 API와 웹 화면이 통합됐다. 도메인 사건이 알림을 생성하는 생산자 연결은 일부 후속 범위로 남아 있다.

팀장 결정이 필요한 것은 알림 화면이 아니라 **알림 생성의 단일 경로**다.

권장 결정:

- 도메인 서비스가 알림 테이블을 직접 조작하지 않고 `NotificationPort` 하나만 호출한다.
- 계약·지원서·마감·리뷰 등 사건별 생산자는 각 도메인 서비스에 둔다.
- 운영 전환 전까지는 현재 in-memory adapter를 유지하되, Prisma adapter와 outbox 저장 시점을 동일한 계약으로 맞춘다.
- 알림 발행 실패가 원래의 핵심 거래를 실패시킬지 여부를 결정한다. 권장값은 핵심 거래를 먼저 확정하고 알림은 재처리 가능한 outbox로 남기는 것이다.

이 결정은 알림 담당자의 화면 구현을 다시 요구하는 것이 아니라, `express-app.ts`에서 주입할 포트와 트랜잭션 경계를 확정하는 작업이다.

### 2.4 프로필 완성도 게이트

applications에는 `ProfileCompletionPort`를 연결할 자리가 있지만, PR #83 이후 현재 통합 경로에서는 `PROFILE_INCOMPLETE` 차단을 의도적으로 적용하지 않고 있다.

권장 결정:

- MVP E2E 기간에는 프로필 게이트를 **경고만 하고 지원은 허용**한다.
- 실제 차단을 켤 때는 user-management가 제공하는 단일 `getProfileCompletion(userId)` 계약을 통해서만 판정한다.
- 게이트를 켜는 시점에는 로그인→역할 선택→프로필 저장→지원 흐름을 하나의 E2E로 검증한 뒤 별도 ADR로 확정한다.

이렇게 해야 인증·프로필 담당자의 내부 모델을 applications가 직접 읽는 결합을 피할 수 있다.

## 3. 실행 모드와 검증 기준

배포·통합 검증은 `AUTH_PROVIDER_MODE=supabase`와 `DATABASE_URL`이 함께 있는 Prisma 경로를 기준으로 한다. `AUTH_PROVIDER_MODE=mock`에서는 `DATABASE_URL`이 있어도 Prisma를 켜지 않는다. mock 사용자 ID가 실제 DB FK와 맞지 않기 때문이다.

PR #106 이후 팀장 QA의 최소 통과 기준은 다음으로 고정한다.

1. Google OAuth 콜백 성공 후 사용자와 세션이 DB에 생성된다.
2. 역할 선택 후 보호된 라우트에 재진입할 수 있다.
3. 프로젝트 생성 후 지원 건수가 `1/1`로 갱신된다.
4. 지원 개별 거절은 pending 건수만 감소시키고 누적 건수는 유지한다.
5. 수락·마감·취소는 pending 건수를 한 번만 `0`으로 정리한다.
6. 마감 스윕을 두 번 호출해도 상태·건수가 중복 변경되지 않는다.
7. 알림 목록·미읽음 수·읽음 처리가 동일한 DB를 본다.
8. Prisma 오류가 서버 프로세스 종료가 아니라 구조화된 4xx/5xx로 반환된다.

## 4. 팀장 결정 순서

1. 원격 `develop` PR #106을 통합 기준으로 고정한다.
2. 지원 건수 갱신의 Prisma 트랜잭션 경계를 확정한다.
3. Vercel Cron과 `INTERNAL_SERVICE_TOKEN` 운영 정책을 확정한다.
4. 알림 생산자·outbox의 실패 처리 정책을 확정한다.
5. 프로필 게이트를 경고 모드로 둘지 차단할지 확정한다.
6. 위 결정 후 이 문서의 상태를 `확정`으로 바꾸고, 필요한 구현만 `app/` 통합 PR로 진행한다.

결정 전에는 기능 담당자에게 추가 작업을 요청하지 않는다. 결정이 확정되면 담당자에게 도메인 구현 변경이 아니라 필요한 포트 호출·어댑터·배포 설정의 반영 범위만 전달한다.

## 5. 근거

- PR #101: 알림 API·웹 화면, ID 길이 확장, rating consumer wiring
- PR #105: 로컬 Prisma·시드·QA 도구 체인
- PR #106: 지원 건수 포트와 마감 스윕 엔드포인트
- `sdd-framework/integration-workflow.md`: prototype diff를 `app/`에 재구현하고 통합 기록을 남기는 규칙
- `sdd-framework/backend-integration-notes.md`: Prisma 선택 조건, seed/FK, 컨트롤러 오류 처리, 운영 전환 함정
- `feedback_loop/2026-09-07/applications.md`: 지원 건수와 프로필 게이트가 외부 포트 부재로 보류됐던 근거
- `app/server/src/express-app.ts`: 저장소·포트·라우터의 실제 조립 지점

## 6. 1단계 구현 기록

2026-09-10 팀장 통합 작업으로 다음을 반영했다.

- `app/server/src/features/applications/application.service.ts`
  - 지원 생성 시 `applicationCount +1`, `pendingApplicationCount +1`
  - 개별 DIRECT 거절 시 `pendingApplicationCount -1`
  - 수락·마감·취소의 일괄 정리 경로는 변경하지 않음
- `app/web/src/features/project-management/ProjectDetailPage.tsx`
  - 프로젝트 소유자 화면에서 누적 지원 수와 대기 지원 수를 함께 표시

이 단계는 포트 호출 연결과 화면 반영까지다. 지원 행 저장과 프로젝트 건수 갱신의 동일 Prisma `$transaction` 경계는 아직 확정·구현하지 않았으므로, production cutover 전 별도 통합 작업으로 남긴다.
