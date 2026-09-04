# user-management 피드백 — 2026-08-27 통합

반영 커밋(prototype 기준): 41d7f4b
sync-log.md 기록: 있음 — mark-synced.sh 실행 후

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 웹 화면은 로그인(`/login`)만 반영했다. 회원가입·이메일 확인 화면은 이번 범위 밖

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- spec.md의 "웹 라우트 목록"은 `/login`, `/sign-up`, `/auth/confirm`, `/terms`, `/privacy`를 전부
  ASSUMPTION으로 나열했다. 서버(controller/service/routes)는 5개 엔드포인트(registrations,
  email-confirmation-requests, email-confirmations, sessions, registration-completions,
  oauth-authorizations, oauth-callbacks, sessions/refresh, sessions/current, contexts/current)를
  전부 그대로 반영했지만, 웹은 `LoginForm.tsx`/`useAuth.ts`/`api/auth.ts`/`auth.routes.tsx`만
  만들었다.

**어떻게 채웠는지**
- `app/web/src/features/user-management/`에 로그인 화면만 두고, `AUTH_ROUTES.signUp` 경로
  상수만 만들어 `LoginForm.tsx`의 "회원가입"·"가입 완료하기" 링크가 하드코딩 없이 참조하게
  했다. `/sign-up` 라우트 자체는 `App.tsx`에 등록하지 않았다 — 지금 그 링크를 누르면
  React Router가 처리하지 못해 `NotFoundPage`(진짜 404)로 떨어진다.

**왜 그렇게 채웠는지 (근거)**
- 팀장 통합 지시가 반영 대상 웹 파일을 `auth.routes.tsx`/`LoginForm.tsx`/`api/auth.ts`/
  `useAuth.ts` 4개로 명시했다 — 화면을 새로 지어내는 과도한 gap-filling을 피하려고 그 범위를
  넘기지 않았다.

**담당자 메모**
- 회원가입·이메일 확인 화면(`/sign-up`, `/auth/confirm`)을 언제 만들지 정해서 `spec.md`의
  ASSUMPTION 표시를 갱신해 달라. 그 전까지 `/sign-up` 링크는 클릭하면 404가 뜬다.
- 2026-08-27 오민혁: 두 화면을 실제 가입·확인 E2E 전 필수 후속 UI로 정하고, 현재 미구현·운영
  차단 상태를 `spec.md`에 명시했다. high-fi 계약 없이 이번 안정화 PR에서 화면을 임의 구현하지 않는다.

---

## 항목 2 — app/web·app/server가 타입을 공유하지 못해 DTO를 웹 쪽에 복사했다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- 원본 `prototype/web/*`는 `../../server/auth.types`를 상대 경로로 그대로 import했다. 이건
  `prototype/` 안에서만 되는 방식이다 — `app/web`·`app/server`는 별도 Vercel 프로젝트로 배포되는
  독립 패키지라(ADR-0007) 이 import가 성립하지 않는다. `app/server/AGENTS.md`도 "두 폴더 사이에
  공유 코드가 실제로 필요해지는 시점에 change-requests/로 재검토한다"고만 해 두고 아직 방법을
  정하지 않았다.

**어떻게 채웠는지**
- `app/web/src/features/user-management/auth.types.ts`에 웹이 실제로 쓰는 DTO(`UserRole`,
  `AuthContext`, `AuthenticatedSessionResponse` 등)만 옮겨 적었다. 서버 정본은
  `app/server/src/features/user-management/auth.types.ts`.

**왜 그렇게 채웠는지 (근거)**
- ADR-0007의 "npm workspaces는 지금 도입하지 않는다" 원칙을 지키려고 새 공유 패키지를 만들지
  않았다. 근거 없음 — 팀장 판단으로 임시 중복을 선택했다.

**담당자 메모**
- API 계약(요청/응답 필드)이 바뀌면 이 두 파일을 함께 고쳐야 한다. 자주 어긋나면
  `change-requests/`로 타입 공유 방식(npm workspaces 등) 재검토를 요청해 달라.
- 2026-08-27 오민혁: 독립 배포 패키지의 임시 DTO 중복, 서버 정본, 동시 갱신·재검토 조건을
  `spec.md`와 `api-contract.md`에 편입했다.

---

## 항목 3 — `api/auth.ts`를 `shared/http.ts`로 옮기며 `shared/http.ts` 자체를 확장했다

상태: 재이슈

**Fact — spec/api-contract에 없던 부분**
- 원본은 `fetch`를 직접 호출했다. 팀장 통합 지시가 "반드시 `shared/http.ts`의 `http` 객체를
  통해 호출하도록 다시 짜라"고 명시했는데, `shared/http.ts`(스캐폴드 최초 버전)는 이 기능이
  필요로 하는 것 두 가지가 없었다: (1) 크로스 오리진 요청에 쿠키를 실어 보내는 옵션
  (`credentials: 'include'`) — Refresh Token이 `__Host-pactfiveRefreshToken` HttpOnly 쿠키로만
  전달되므로 없으면 배포 환경(app/web·app/server가 다른 오리진, ADR-0007)에서 로그인 자체가
  끊어진다. (2) 이 기능의 에러 응답 형식(`{ error: { code, message, details } }`)을 읽는 로직 —
  기존 `shared/http.ts`는 `{ message }` 평문 형식만 지원했다.

**어떻게 채웠는지**
- `app/web/src/shared/http.ts`에 `credentials: 'include'`를 기본으로 추가하고, `ApiError`에
  `code` 필드를 추가했으며, `{ error: { code, message } }` 형식을 우선 파싱하고
  `{ message }` 형식을 하위 호환으로 남겼다. 또한 세션 복원 직후처럼 provider가 아직 최신
  토큰을 모를 때를 위해 `authToken` override 옵션을 `RequestOptions`에 추가했다.

**왜 그렇게 채웠는지 (근거)**
- `shared/http.ts`는 "여러 기능이 동시에 건드리는 지점이라 팀장이 관리"한다(app/web/AGENTS.md)
  — 이번 통합에서 팀장 권한으로 직접 고쳤다. `{ error: { code, message, details } } }` 형식은
  `docs/naming-convention.md`가 아직 프로젝트 표준 에러 형식을 확정하지 않은 상태에서(§17
  "공통 에러 코드 형식... 본 문서 범위 밖") user-management의 api-contract.md가 가장 구조화된
  형식을 제시했기에 그걸 표준으로 채택했다.

**담당자 메모**
- 다른 기능이 다른 에러 형식을 쓰려 하면 여기서 충돌한다. `docs/naming-convention.md`에
  공통 에러 형식을 정식으로 못 박는 걸 다음 팀 회의 안건으로 올려 달라.
- 2026-08-27 오민혁: 현재 envelope는 user-management 작업 계약으로만 유지한다. 프로젝트 공통
  표준 채택은 여러 기능과 `shared/http.ts`에 영향을 주므로 관련 담당자·팀장 회의 안건으로 재이슈한다.
- 2026-08-27 오민혁: 통합 앱의 배포 예시는 별도 `*.vercel.app` 서버 주소를 직접 가리키지만 현재
  계약은 동일 출처 `/api/v1`과 `SameSite=Strict` Refresh 쿠키를 전제로 한다. 같은 Origin rewrite/BFF
  또는 same-site 커스텀 도메인 중 하나와 API base의 `/api` 포함 규칙을 팀장이 확정해야 하므로,
  라이브 인증 E2E 전 배포 차단 안건으로 함께 재이슈한다.
- **2026-09-03 팀장**: Origin rewrite/BFF 쪽으로 확정했다 — 커스텀 도메인은 구매하지 않고
  `*.vercel.app` 그대로 쓰기로 했고, `app/web/vercel.json`에 `/api/*` → `app/server` 프록시
  rewrite를 둬서 브라우저 관점에서는 계속 동일 출처로 본다. `SameSite=Strict`를 `None`으로
  낮출 필요가 없다 — same-origin 요청은 `Strict`로도 그대로 통과한다. 근거·기각한 대안(커스텀
  도메인, HttpOnly 쿠키 포기)은 `docs/decisions/0013-web-origin-same-origin-rewrite.md` 참고.
  API base에 `/api` 포함 규칙은 지금 코드(`app/web/vite.config.ts`의 `/api` 프록시, 신규
  `vercel.json`의 `source: "/api/:path*"`)와 그대로 맞다 — 바꿀 것 없다. 다만
  `app/web/vercel.json`의 실제 `destination`은 Vercel 프로젝트를 만들어 `app/server`의 실제
  배포 URL을 확인해야 채울 수 있어 아직 자리표시자다 — 첫 배포 때 마무리한다. 이견 있으면
  알려 달라, 없으면 이 항목은 반영완료로 닫아도 된다.

---

## 항목 4 — Origin 검증은 단일 문자열만 비교한다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `auth.service.ts`의 `requireAllowedOrigin(origin, allowedOrigin)`은 원본부터 문자열 하나와
  정확히 비교하는 구조였다. `app/server/src/app.ts`의 CORS 설정(`WEB_ORIGIN`)은 쉼표로 여러
  오리진을 허용할 수 있는데, 이 인증용 Origin 검증은 `allowedOrigins[0]`(첫 번째 값)만 쓴다.

**어떻게 채웠는지**
- `app.ts`에 `primaryWebOrigin = allowedOrigins[0] ?? 'http://localhost:5174'`를 만들어
  `createAuthRouter(authService, primaryWebOrigin)`에 그대로 넘겼다. 코드를 고치지 않았다 —
  원본 `auth.service.ts`의 로직을 그대로 신뢰했다.

**왜 그렇게 채웠는지 (근거)**
- 지금 배포 계획(ADR-0007)은 웹 오리진이 하나(Vercel 프로젝트 1개)뿐이라 실질적 문제는 없다.
  다중 오리진(스테이징 등)이 생기면 `requireAllowedOrigin`을 배열 비교로 바꿔야 한다 — 근거
  없음, 팀장이 "지금 당장 문제 없음"으로 판단해 보류했다.

**담당자 메모**
- 스테이징 도메인을 추가로 열 계획이 있으면 미리 알려 달라 — `auth.service.ts`를 배열 비교로
  바꿔야 한다(원본 파일이라 조준영이 아니라 오민혁이 고쳐야 하는 부분).
- 2026-08-27 오민혁: 기존 단일 문자열 호출의 하위 호환을 유지하면서 복수 Origin 완전 일치
  검증을 prototype controller/service/router와 R17 테스트에 반영했다.

---

## 항목 5 — `shared/require-auth.ts` 신설

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `app/server/AGENTS.md`는 포트/어댑터 3종(인증·결제·AI)만 정의했고, "다른 기능이 로그인한
  사용자인지 확인하는 방법"은 어디에도 문서화돼 있지 않았다.

**어떻게 채웠는지**
- `app/server/src/shared/require-auth.ts`를 새로 만들었다. `AccessTokenVerifier`(토큰 문자열을
  받아 `{userId, role}`을 돌려주는 함수)를 주입받는 팩토리 `createRequireAuth`로, 벤더 SDK를
  직접 import하지 않는다(ADR-0009와 같은 원칙). 실제 검증 함수는 `app.ts`가 mock 모드에서는
  `auth.mock.ts`의 고정 토큰, 그 외에는 `AuthSessionService.getCurrentContext`로 주입한다.

**왜 그렇게 채웠는지 (근거)**
- contracts-payments를 포함해 "인증된 사용자인지" 확인이 필요한 기능이 늘어날 걸 예상해
  두 번째 필요 시점(app/web/AGENTS.md의 shared/ 승격 기준과 같은 원칙)을 기다리지 않고 먼저
  만들었다 — user-management 자신도 아직 이 미들웨어를 자기 라우트에 쓰지 않는다(자기 라우트는
  컨트롤러 내부에서 직접 Bearer를 읽는다). 다만 실제로 contracts-payments에 적용해보니 그
  기능은 서버 간 토큰이 필요해(`shared/require-service-token.ts` 참고) 아직 `requireAuth`를
  쓰는 실제 소비자가 없다 — 현재는 다음 기능(project-management 등)을 위해 미리 준비해 둔
  상태다.

**담당자 메모**
- `req.user`를 쓰는 다음 기능을 만들 때 이 미들웨어를 재사용해 달라. 실제 Supabase 어댑터가
  준비되면 `app.ts`의 `AccessTokenVerifier` 주입부만 바꾸면 된다.
- 2026-08-27 오민혁: 다른 보호 기능은 주입형 `AccessTokenVerifier`를 재사용하고 공급자 SDK나
  Refresh Token을 직접 참조하지 않는 책임 경계를 `spec.md`와 `api-contract.md`에 편입했다.

---
