---
title: "프로필 완성도 포트의 applications 연결 및 저장소·실패 계약"
status: "제안"
requested_by: "오민혁"
date: "2026-09-08"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/reference/prd-v6.4.md]
affected_features: [user-management, applications, project-management]
---

# 스펙 변경 신청

> 2026-09-08 후속: 아래 6번의 **feature 기본 생성기**는
> `0002-user-rating-and-auth-id-integration.md`에서 ULID30으로 보정했다. 이 문서는 최초
> 프로필 증분의 근거 기록을 유지한다. app 생성기 반영·기존 36자 자료 조사는 여전히 후속이다.

## 배경 (왜 필요한가)

2026-09-08 회의 및 담당자 요청으로 user-management 내부 조회 포트를 착수했다.
현재 develop `ec1c01f`의 applications prototype은 3상태 ProfileCompletionPort를 받지만,
`app/server/src/features/applications/application.types.ts`는 제공자가 없다는 이유로 검사를
이식하지 않았다. 이번 변경은 user-management의 포트·판정·Mock·테스트만 제공한다.

## 현재 스펙

- PRD D-58: `getProfileCompletion(userId) → { status, completedAt, missingFields }`.
- ERD E-14: 완성 여부는 필수 항목의 파생 상태이며, 필수 필드 저장 완료 시 완성이면 now(),
  미완성이면 NULL을 저장한다. 기술 연결 해제/비활성화도 재판정 대상이다. 요약 ERD의
  “최초 완성 시각” 표현과 달리 원본 저장 규칙을 따른다.
- applications는 COMPLETE/INCOMPLETE/UNAVAILABLE을 지원한다. UNAVAILABLE를
  DEPENDENCY_UNAVAILABLE(503)로, 미완성 지원 POST를 PROFILE_INCOMPLETE(409)로 처리한다.
- project-management `prototype/server/ports/external.port.ts`의 ProfilePort는 2상태만
  지원한다. 현재 서비스는 COMPLETE가 아니면 403으로 처리하므로 조회 장애와 미완성을 구분하지 못한다.
- ERD의 실제 business_field와 Prisma BusinessField는 D-91/E-27 이후 6종이며 ETC가 없다.
  옛 profile 설명·CHECK에는 ETC가 남아 있다.

## 제안하는 변경

1. **applications / 팀장:** 기존 3상태 포트에 `createProfileCompletionPort(repository)`를
   조립 지점에서 주입한다. 인증된 PactFive `users.id`를 전달한다(Supabase authUserId 아님).
   eligibility뿐 아니라 실제 지원 POST에서도 다시 확인한다. 역할/프로젝트 권한 검사는 유지한다.
   unknown 계정을 COMPLETE로 처리하는 기존 applications 기본 Mock을 운영 대체재로 쓰지 않는다.
2. **팀장 / DB:** `ProfileCompletionRepository`의 일관된 snapshot adapter를 구현한다.
   사용자 role/deletedAt, 그 역할의 본인 profile, freelancer_skills로 연결된 skill의 활성 상태를
   같은 DB snapshot에서 읽는다. 전체 skills 카탈로그를 연결 기술처럼 반환하지 않는다.
   Prisma Date는 UTC ISO 문자열로 변환한다. 레코드 없음과 저장 장애를 분리하고 조회는 쓰기를 하지 않는다.
3. **프로필 저장 후속:** 프로필 저장·기술 변경과 `completed_at` 갱신을 같은 트랜잭션으로 처리한다.
   이번 조회 포트는 필드가 완성됐어도 저장 시각이 없으면 UNAVAILABLE를 반환한다. 기존 NULL 시각
   데이터의 보정이 필요하면 별도 승인된 백필을 수행한다. 조회 시 now()를 만들어 숨기지 않는다.
   저장/조회가 분리된 사이에 프로필이 바뀌는 TOCTOU 방지는 실제 지원 트랜잭션 통합 시 검증한다.
4. **project-management / 유동우:** UNAVAILABLE 상태와 서비스 오류(503) 매핑을 먼저 합의한다.
   단언 캐스팅이나 INCOMPLETE 치환으로 기존 2상태 포트에 억지 연결하지 않는다.
   기존 mock의 phone 누락 필드는 ERD 필수 목록에 없으므로 새 정본 missingFields 코드에 맞춘다.
5. **공유 문서 / 팀장:** ETC 잔존 설명과 “최초 완성” 요약을 실제 enum/저장 규칙에 맞춘다.
   기타 입력을 다시 지원하려면 별도 제품 결정 및 enum·스키마·폼 계약 동기화가 먼저다.
6. **기존 ID/DB 정합성:** 인증 prototype의 기본 `nextUserId`는 `usr_` + UUID 32자로 36자이지만,
   users.id 정본은 varchar(30)이다. 이번 조회 포트는 기존 ID를 불투명하게 받아 정확히 조회하므로
   인증 흐름을 추가로 차단하지 않는다. 다만 실제 DB 가입/조회 호환은 생성기와 DB 제약의 별도
   정합성 확인이 필요하다. 이번 증분에서 기존 인증 코드나 스키마를 변경하지 않는다.

## 영향 범위

현재 PR은 `features/user-management/**`만 변경한다. app, 공유 DB/API, applications 및
project-management 파일·UI·기존 인증/탈퇴 동작은 변경하지 않는다. 이전 두 인증·AI 오류의
app 직접 수정 예외 승인은 이 새 기능으로 확대하지 않는다.

팀장 통합 완료 조건: 실제 DB snapshot adapter, 프로필 저장 시각 갱신 경로, 지원 전 게이트,
미완성 프로필을 채울 화면/복귀 동선까지 확인한다. 그 전에는 포트 구현을 실제 지원 차단 배포
완료로 보고하지 않는다. 신설 HTTP 프로필 API 경로는 이 CR에서 결정하지 않는다.

## 대안으로 검토했던 것

- completed_at만 검사: 필드 누락·마지막 기술 비활성화 뒤의 오래된 시각으로 통과할 수 있어 기각.
- 매 조회 시 완성 시각을 생성/저장: 조회가 쓰기가 되고 저장 시점 불일치를 숨겨 기각.
- 사용자 없음/장애면 COMPLETE: 게이트 우회이므로 기각.
- 미완성이면 탈퇴/인증 오류를 반환: 프로필 입력 부족과 인증 실패를 혼동하므로 기각.
- 다른 feature 또는 app를 함께 수정: 이번 담당 범위 밖이므로 소비 계약과 통합 요청으로 분리.

## 2026-09-10 QA 후속 — 프로필 화면 현황과 팀장 통합 인계

### 확인된 사실과 정정

기준은 최신 develop `38ab13c`에서 시작한 `fix/owner-qa-handoff`다. 아래 코드 점검은 로컬
정적 확인이며 배포/실DB 재검증을 뜻하지 않는다. 이전 배포 QA의 `/profile` 없는 페이지와
로그인 후 헤더 지연 표시를 출발점으로 원본과 app 사본을 대조했다.

- **FACT:** 원본 `spec.md` 제외 범위와 `index.md`에 프로필 상세 화면·저장 API가 명시적으로
  빠져 있다. 독립 프로필 시안, `ProfilePage`/수정 폼, 웹 프로필 API client는 없다.
  따라서 **“완성된 프로필 화면을 app으로 이식만 하면 된다”는 해석은 잘못이다.**
- **FACT:** 원본에 있는 high-fi는 로그인·회원가입·이메일 확인·비활성 탈퇴 4종이다.
  가입 시안의 “상세 프로필은 실제로 필요한 순간에 이어서 입력합니다”와 `/profile`
  `returnTo` 허용은 프로필 화면 구현의 증거가 아니다.
- **FACT:** `GET /api/v1/auth/contexts/current`는 이름·이메일을 제공한다. 이것은 인증된 사용자
  요약이며 회사/업종·경력/기술을 읽고 수정하는 프로필 API가 아니다. `DELETE /users/current`는
  탈퇴 잠정 계약일 뿐 프로필 조회 API로 재사용하지 않는다.
- **FACT:** app에는 `PrismaProfileCompletionRepository`까지 이식돼 있다. 이전 본문의
  “실제 DB adapter 구현 필요”는 9/9 이식으로 일부 해소됐으나, 실제 DB 일관성·저장 시각 갱신·
  지원 게이트 통합 완료를 검증한 것은 아니다. **9/9 RW 결정은 게이트 OFF 유지**이며 이번
  작업은 그 결정을 바꾸거나 “미완성” 계정을 새로 차단하지 않는다.

### 바로 참고할 파일 매핑

| 목적 | feature 원본 | app 통합 대상/현재 차이 |
|---|---|---|
| 인증 화면 디자인 | `design/high-fi.html`, `high-fi-sign-up.html`, `high-fi-email-confirmation.html`, `auth-foundation.css` | 기존 `app/web/src/features/user-management/` 인증 화면의 참조. 프로필 시안으로 간주하지 않음 |
| 이름·이메일·역할·사진 요약 | `prototype/web/api/auth.ts#getCurrentAuthContext`, `api-contract.md`의 GET contexts/current | 같은 app API client/서버 route 존재. 필드: `userId`, `name`, `email`, `role`, `profileImageUrl`, `authenticated`, `accessTokenExpiresAt` |
| 공유 로그인 화면 상태 | `prototype/web/useAuth.ts`의 `createAuthViewStore`와 `useSyncExternalStore` 구독 (이번 보정) | `app/web/src/features/user-management/useAuth.ts`에 재해석 필요. app은 `shared/http.ts`의 토큰 provider/ApiError 및 DEV 로그인 경로도 보존해야 함 |
| 프로필 완성도 내부 조회 | `prototype/server/profile-completion.port.ts`, `.repository.ts`, `.service.ts` | `app/server/src/features/user-management/`에 동명 3파일+`prisma-profile-completion.repository.ts` 있음. express 조립/지원 게이트는 보류 |
| 역할별 완성 조건·회귀 | `spec.md` PC-01~08, `prototype/tests/profile-completion.test.ts` | CLIENT 회사명·업종 / FREELANCER 분야·경력·활성 연결 기술. 조회 응답은 상태·완성시각·누락 필드뿐이며 화면의 실제 입력값이 아님 |
| 프로필 화면·저장 API | **없음 — 현재 원본 제외 범위** | 라우트/읽기 전용 요약만 우선 제공할지, 역할별 편집·저장까지 이번 범위에 넣을지 팀장 범위 결정 필요 |

### 로그인 상태 원본 보정과 app 적용 순서

1. **원인:** 원본과 app 모두 토큰만 모듈에 공유하고 화면 상태는 훅마다 `useState`로 갖고 있었다.
   app의 `App.tsx#AppRoutes`와 `LoginForm.tsx`가 별도 훅을 호출하므로 폼의 성공이 헤더의
   `viewer`에 즉시 전달되지 않는다. 알림 구독의 `viewer.userId`도 이 값을 사용한다.
2. **이번 원본 수정:** 한 문서의 공유 메모리 상태를 `useSyncExternalStore`로 구독한다.
   로그인/가입 확인/복원/실패/로그아웃이 같은 상태를 게시한다. 계정 전환 제출 중 이전 토큰을
   제거하고, 복원 일시 장애는 R16대로 기존 메모리 토큰·쿠키를 강제 폐기하지 않는다.
   늦은 로그아웃 성공/실패도 epoch 검사 후에만 최신 화면 상태를 바꾼다.
3. **팀장 적용:** app의 DTO 경로·`ApiError`·`setAuthTokenProvider`는 유지하며 상태 구독과
   게시/초기 복원/epoch 경계만 옮긴다. `devLoginAsMock`·`devLogoutMock`도 같은 상태 게시를
   사용해야 한다. feature 파일을 통째로 복사해 app 전용 연결을 지우지 않는다.
4. **중복 복원 정리:** app `AppRoutes`에 명시적 `restore()` effect가 있고 `useAuth`에도
   mount 복원이 있다. 초기 복원의 소유자를 한 곳으로 정한다. 여러 화면 마운트로 복원을
   다시 시작하거나 새 로그인을 이전 컨텍스트로 덮지 않아야 한다.
5. **UI 범위 결정:** 당장 QA 요구가 이름·이메일 읽기라면 기존 인증 컨텍스트 기반 요약 화면을
   최소안으로 검토할 수 있다(**제안, 미구현**). 상세 편집을 선택하면 시안→spec/API→
   Mock/저장 구현→완성 시각/복귀 흐름 검증 후에만 지원 게이트를 켠다. API 경로·필드·게이트를
   이번 담당 원본 수정에 끼워 넣지 않는다.

### 팀장 통합 후 회귀 시나리오

| 시나리오 | 기대 결과 / 완료 증거 |
|---|---|
| 신규 CLIENT 로그인 → 새로고침 없이 헤더/요약 진입 | 로그인+contexts/current 200과 응답의 name/email이 화면에 그대로 일치. 헤더 로그인 CTA가 즉시 사용자 상태로 변경 |
| CLIENT 로그아웃 → FREELANCER 로그인 | 두 화면과 알림 `viewer`가 즉시 새 계정으로 전환. 이전 이름/이메일/알림이 남지 않음 |
| 로그인 진행 중 또는 직후 다른 인증 소비자 마운트 | 중복 초기 복원으로 로그인 결과를 덮지 않음 |
| 느린 restore 응답 뒤 새 계정 로그인 / 느린 logout 응답 뒤 새 로그인 | 이전 epoch 응답으로 새 계정을 지우거나 이전 계정을 되살리지 않음 |
| 로그아웃 실패 / refresh 503 / 확정 401 | 로그아웃 실패는 재시도 행동, 503은 일시 장애, 확정 401만 로그인 유도. 코드·문구·UI를 별도로 기록 |
| `/profile` 직접 진입·새로고침·비로그인 진입 | 팀이 채택한 화면/가드/returnTo가 동작. 주소를 허용 목록에 둔 것만으로 PASS 처리하지 않음 |
| 프로필 상세를 추가하기로 한 경우 | 역할별 필드 저장·재조회·계정 격리·completed_at 원자적 갱신·미완성→수정→원래 지원 복귀를 별도 검증. 그 전엔 게이트 OFF |

원본 자동/마운트 훅 검증 결과와 실행 조건은 `../test-report.md`의 2026-09-10 절이 정본이다.
이번 변경은 app/공유 문서/실제 계정·DB를 수정하지 않았고, 과거 피드백 상태도 임의 종결하지 않았다.
