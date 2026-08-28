# user-management 피드백 — 2026-08-28 통합

반영 커밋(prototype 기준): 8db808b
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 이전 통합의 "첫 오리진만 검증" 잠정 처리가 해소됐다

상태: 미확인

**Fact**
- 2026-08-27 반영에서 팀장이 이렇게 잠정 처리했었다: CORS는 `WEB_ORIGIN`의 여러 오리진을
  허용하는데 `requireAllowedOrigin`은 단일 문자열만 받아, 첫 번째 오리진만 검증에 썼다
  (`app/server/src/app.ts`의 `primaryWebOrigin`).
- 이번 델타에서 담당자가 `AllowedOrigins = string | readonly string[]`로 넓히고
  `requireAllowedOrigin`이 목록을 받도록 고쳤다.

**어떻게 채웠는지**
- `app.ts`가 `primaryWebOrigin` 대신 허용 목록 전체를 `createAuthRouter`에 넘긴다.
  `WEB_ORIGIN`이 비어 있을 때의 로컬 기본값(`http://localhost:5174`)은 그대로 유지했다.

**왜 그렇게 채웠는지 (근거)**
- 담당자가 원본에서 직접 해결한 것을 그대로 받았다. 팀장 잠정 결정이 사라졌으므로 이 항목은
  기록용이다 — 반영할 것이 없으면 `반영완료`로 닫아도 된다.

**담당자 메모**
-

---

## 항목 2 — 실제 Supabase 어댑터를 조립 지점에 연결했다 (환경 변수 4개 필요)

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 이번 델타의 `supabase-auth.adapter.ts`는 자리표시자(항상 예외)에서 실제 구현 722줄로 바뀌었고,
  `createSupabaseAuthAdapter(options)`가 `supabaseUrl` · `publishableKey` · `serviceRoleKey` ·
  `emailConfirmationRedirectTo` 넷을 **필수**로 받는다.
- 이 값들을 어떤 환경 변수 이름으로 읽을지는 원본에 없다 — 어댑터는 인자로만 받는다.

**어떻게 채웠는지**
- `app.ts`에서 아래 이름으로 읽는다 (`docs/naming-convention.md` §12 UPPER_SNAKE_CASE):
  - `SUPABASE_URL` → `supabaseUrl`
  - `SUPABASE_ANON_KEY` → `publishableKey`
  - `SUPABASE_SERVICE_ROLE_KEY` → `serviceRoleKey`
  - `AUTH_EMAIL_CONFIRMATION_REDIRECT_URL` → `emailConfirmationRedirectTo`
    (없으면 `${WEB_ORIGIN 첫 값}/auth/confirm`)
- `@supabase/supabase-js`를 `app/server/package.json` 의존성에 추가했다.
- 하나라도 비면 어댑터가 예외를 던지고, 기존 try/catch가 흡수해 `/api/v1/auth` 라우트만
  등록되지 않는다(fail-closed). `/health`와 다른 기능은 계속 동작한다.

**왜 그렇게 채웠는지 (근거)**
- `app/web/AGENTS.md` "환경 변수" — `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 비밀값이라
  `VITE_`를 붙이지 않는다. `SUPABASE_ANON_KEY`만 공개 전제 키다.
- 이름은 Supabase 표준 명칭을 따랐다. **어댑터 인자명(`publishableKey`)과 환경 변수명
  (`SUPABASE_ANON_KEY`)이 다른 점**을 확인해 달라 — 담당자가 다른 이름을 의도했다면 `app.ts`
  한 줄만 고치면 된다.

**담당자 메모**
-

---

## 항목 3 — `RegistrationIntentRepository`가 인메모리 구현으로만 돌아간다

상태: 미확인

**Fact**
- 이번 델타에서 `AuthRepositories`에 `RegistrationIntentRepository`(가입 역할·이름·returnTo의
  CAS 경계) 4개 함수가 추가됐다.

**어떻게 채웠는지**
- 원본 `prototype/mock/in-memory-auth.repository.ts`를 그대로 옮겨 새 인터페이스를 만족시켰다.
  import 경로만 `../server/...` → `./...`로 바꿨다.

**왜 그렇게 채웠는지 (근거)**
- `app/server/prisma/schema.prisma`가 여전히 비어 있어(팀장 전담) 실제 저장소를 만들 수 없다.
  스키마가 채워질 때 `auth_sessions`·`users`와 함께 이 테이블도 필요하다는 점을 기록해 둔다.
- 원본에 있던 테스트용 장치(`failNextRegistrationIntentSave`, `seedUser`, `getSessions` 등)도
  같이 넘어왔다. 배포 코드에 두기에는 어색하지만, 지우면 담당자 `run.tsx`와 갈라지므로
  Prisma 구현으로 교체할 때 함께 정리하는 편이 낫다.

**담당자 메모**
-
