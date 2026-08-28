# app/web/ — 프론트엔드 구조 지침 (팀장 전용)

이 폴더는 실제 배포되는 프론트엔드 코드입니다. 팀원은 이 폴더를 직접 수정하지 않습니다 — 상위
지침(권한·통합 절차)은 `app/AGENTS.md` 참고. 이름 규칙(컴포넌트·훅·API 함수명 등)은
`docs/naming-convention.md` §5를 따릅니다 — 이 문서는 이름 규칙이 아니라 **폴더 구조·진입점·
공용 접점**을 다룹니다.

## 통합 시 기본 방침 — 재해석해서 일관되게 다시 짠다

`features/{기능}/prototype/web/`의 코드를 그대로 복사하지 않는다. 담당자가 표현한 **의도**를
읽고, 이 문서의 구조에 맞게 다시 구현한다 (`sdd-framework/integration-workflow.md` 3단계,
ADR-0006과 동일한 원칙). 담당자마다 폴더 구성이 달라도 통합 결과물은 8개 기능이 전부 같은
모양이어야 한다.

### 무엇이 무엇의 정본인가 (2026-08-28 추가)

**의도는 네 곳에 나뉘어 있고, 같은 것을 두 곳이 다르게 말하면 아래 순서가 이긴다.**

| 무엇 | 정본 | 비고 |
|---|---|---|
| 화면 구조 — 레이아웃·영역 구성·무엇이 어디에 놓이는가 | **`features/{기능}/design/*.html`** | `prototype/web/*.tsx`가 아니다 |
| 화면 문구 | `design/*.html`의 "필수 요소 목록" (PRD §14를 옮긴 것) | 시안의 **일부**다 |
| 색·간격·컴포넌트 치수 | `design-system/design-tokens.md` → `design/_tokens.css` | `app/web/src/shared/ui/tokens.css`가 그 사본 |
| 규칙·상태 판정 | `spec.md` | |
| 요청/응답 형태 | `api-contract.md` | |

**`design/*.html`을 "필수 요소 목록이 적힌 표"로만 읽지 않는다.** 그 파일에는 화면의 실제
마크업과 CSS가 들어 있다 — 2단 그리드인지, 사이드바가 sticky인지, 카드가 어디서 끊기는지,
앱 셸(`.frame > header`)에 무엇이 있는지가 전부 거기 있다. 목록 섹션만 확인하고 파일을 닫으면
문구만 맞고 구조는 전혀 다른 화면이 나온다.

**`prototype/web/*.tsx`는 참고다.** 담당자가 뼈대만 짜두고 시안에서 더 진전시킨 경우가 있어,
둘이 다르면 **시안이 옳다**. 프로토타입 코드를 구조의 근거로 삼지 않는다.

> 2026-08-28 통합에서 실제로 이 순서를 어겨 SCR-B02(프로젝트 상세)를 프로토타입 컴포넌트
> 기준으로 만들었고, 시안의 2단 레이아웃·사이드바·`.kv` 행이 통째로 빠졌다.
> `feedback_loop/2026-08-28/project-management.md` 항목 6 참고.

재해석 과정에서 원본에 없던 공백을 메웠다면 `feedback_loop/`에 남긴다 — 무엇을 어떻게 메웠는지
담당자가 다음 작업일에 확인하고 자기 spec에 반영할 수 있어야 한다.

## 진입점 구조

- `app/web/src/main.tsx` — Vite 진입점. `App`을 렌더링만 한다.
- `app/web/src/App.tsx` — **라우터 조립 지점.** 각 기능의 `{도메인}.routes.tsx`를 모아 등록하는
  곳은 여기 한 곳뿐이다 (`app/server/src/app.ts`가 백엔드 라우트를 한 곳에서 조립하는 것과 대칭).
- 라우팅 라이브러리는 **React Router**로 확정한다 (근거·재검토 조건:
  `docs/decisions/0011-frontend-routing-library.md`).

  **교체 가능하도록 추상화하지 않는다.** 라우터 API(`<Link>`, `useNavigate`, `useParams`,
  `<Outlet>`)는 화면 전반에 스며드는 성격이라, 이걸 전부 감싸는 래퍼를 만드는 비용이 교체
  이득보다 크다 (`sdd-framework/constitution.md` 원칙 6). 대신 값싸게 얻을 수 있는 격리만
  한다 — 라우트 **정의**는 `App.tsx` + 각 기능의 `{도메인}.routes.tsx`에만 두고, 화면 컴포넌트
  안에 라우트 경로 문자열을 하드코딩하지 않는다(경로 상수는 각 기능의 `routes.tsx`에서 export).

## 기능 폴더 구조 — 폴더는 기능명, 파일은 도메인명

`app/server/src/features/`가 이미 이 방식이다(폴더는 8개 기능명, 파일명은
`auth.controller.ts`처럼 도메인명 — `docs/naming-convention.md` §6). 프론트도 동일하게 맞춘다.

```
app/web/src/features/{기능명}/          # 예: user-management (features/ 폴더명과 1:1)
  {도메인}.routes.tsx                   # 예: auth.routes.tsx — 이 기능의 라우트 정의 + 경로 상수
  {Component}.tsx                       # 예: LoginForm.tsx (§5: PascalCase, Page/Form/Dialog 접미사)
  api/{도메인}.ts                        # 예: api/auth.ts — API 호출 함수 (비즈니스 행위 이름, §5)
  use{도메인}.ts                         # 예: useAuth.ts (§5: use + camelCase)
```

기능명은 kebab-case(`user-management`), 도메인명은 그 기능이 다루는 대상(`auth`)이다. 둘이
다를 수 있다 — `use{기능명}.ts`로 쓰면 `useUser-management.ts` 같은 쓸 수 없는 이름이 나오므로
**파일명에는 항상 도메인명을 쓴다.**

폴더 **안**의 세부 구성(컴포넌트를 몇 개로 쪼갤지, 하위 폴더를 더 팔지)은 기능마다 자유다.
아래 "폴더 간 접점"만 공통 규칙으로 고정한다.

## 폴더 간 접점 — 기능끼리 직접 참조하지 않는다

**다른 기능 폴더의 파일을 import하지 않는다. 배럴(`index.ts`)도 두지 않는다.** 배럴을 두면
기능 간 참조를 허용하는 방향이 되고, 순환 import·HMR 문제도 따라온다.

다른 기능의 것이 필요해지면 둘 중 하나로 푼다:

1. **`shared/`로 올린다** — UI·유틸처럼 화면단에서 공유되는 것.
2. **API 호출로 푼다** — 데이터가 필요한 것이라면 서버를 거친다.

올리는 시점 기준: **같은 것이 두 번째로 필요해질 때 올린다.** 한 번만 쓰이는 걸 미리 올리면
`shared/`만 비대해진다 (우연히 비슷한 중복인 경우가 많다).

> `prototype/web/index.tsx`는 계속 담당자 쪽 규약으로 남는다 — `tools/preview` 하네스가 읽는
> 화면 default export다(`sdd-framework/feature-workflow.md` DoD). `app/web`에는 이 파일을
> 옮기지 않는다. 이름이 비슷해 혼동하기 쉬우니 주의.

## 공용 코드 (`app/web/src/shared/`)

여러 기능이 같이 쓰는 것만 둔다. 이 폴더는 여러 기능이 동시에 건드리는 지점이라 **팀장이
관리하고, 필요하면 관련 담당자와 회의해서 수정한다.**

최소 구성:

```
app/web/src/shared/
  http.ts          # 공용 HTTP 클라이언트 (아래 참고) — 통합 첫 커밋에서 고정한다
  routes.ts        # 앱 전역 경로 상수(로그인, 홈 등 기능에 속하지 않는 것)
  ui/              # 공통 레이아웃·버튼 등 (design-system/ 토큰 사용)
```

### 공용 HTTP 클라이언트 (`shared/http.ts`)

base URL·인증 헤더 주입·에러 처리는 **횡단 관심사**다. 기능마다 각자 구현하면 8가지로 갈린다.
`api/{도메인}.ts`는 반드시 이 클라이언트를 거쳐 호출한다(`fetch`/`axios`를 직접 부르지 않는다).

이 파일 하나가 책임지는 것:

- base URL 결정 (`import.meta.env.VITE_API_BASE_URL`)
- 인증 헤더 주입 (Supabase 세션 토큰 — 컴포넌트가 토큰을 직접 다루지 않는다)
- 공통 에러 처리 (401 → 로그인 화면으로, 그 외 4xx/5xx → 일관된 에러 객체로 변환)
- 요청/응답 JSON 직렬화

## 외부 벤더(Supabase 등) 접근

화면 컴포넌트가 Supabase 클라이언트 SDK를 직접 import하지 않는다. `app/server/AGENTS.md`의
port/adapter 원칙과 대칭되게, 인증 상태·세션 접근은 `shared/`의 얇은 wrapper(예: `useSession()`)를
통해서만 한다. 라우터와 달리 벤더 SDK는 호출 지점이 좁아서 감싸는 비용이 실제로 싸다.

## 환경 변수 — `VITE_` 접두사는 "공개"라는 뜻이다

Vite는 `VITE_`로 시작하는 변수만 클라이언트에 노출한다. 뒤집으면 **`VITE_`를 붙이는 순간 그
값은 번들에 평문으로 박혀 누구나 볼 수 있다.**

- 프론트에서 쓰는 변수는 `VITE_` + UPPER_SNAKE_CASE: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.
- **비밀값에는 절대 `VITE_`를 붙이지 않는다.** `SUPABASE_SERVICE_ROLE_KEY`, `PG_SECRET_KEY`,
  `LLM_API_KEY`, `DATABASE_URL`은 서버 전용이다 — 프론트에서 필요해 보이면 설계가 잘못된 것이니
  서버 엔드포인트를 거치도록 바꾼다.
- `SUPABASE_ANON_KEY`는 공개 전제로 설계된 키라 노출돼도 되지만, `SERVICE_ROLE_KEY`와 이름이
  비슷해 실수하기 쉽다 — `.env.example`에서 공개/서버전용을 구분해 표기한다.

## 통합 시 확인 (Definition of Done)

`sdd-framework/integration-workflow.md`의 UI 게이트(design-system/ux-philosophy 체크리스트)에
더해 아래도 확인한다:

**화면이 시안과 같은가** (2026-08-28 추가 — 아래 코드 규칙만 있고 이 항목이 없어서 실제로
빠졌다):

- [ ] `design/*.html`을 열어 **화면 단위로** 대조했다 — 목록 섹션만 보지 않았다
- [ ] `SCR-Bxx → app/web 컴포넌트` 매핑을 통합 기록(`feedback_loop/` 또는 PR 본문)에 남겼다.
      시안에 있는데 이번에 만들지 않은 화면은 **왜 뺐는지**와 함께 적었다
- [ ] 시안의 영역 구성(단 나누기·사이드바·카드 경계·앱 셸)이 반영됐다
- [ ] `npm run check:design`이 통과한다 (`design/_tokens.css`의 클래스가
      `shared/ui/tokens.css`에 있는가 — 빠지면 시안의 레이아웃을 쓸 수 없다)

**코드 규칙**:

- [ ] 폴더는 기능명, 파일은 도메인명 규칙을 따른다
- [ ] `{도메인}.routes.tsx`가 있고 `App.tsx`에 등록되어 있다
- [ ] 다른 기능 폴더의 파일을 import하지 않는다 (배럴도 없다)
- [ ] `api/*.ts`가 `shared/http.ts`를 거쳐 호출한다 (`fetch`/`axios` 직접 호출 없음)
- [ ] 화면 컴포넌트에 라우트 경로 문자열이 하드코딩돼 있지 않다
- [ ] Supabase 등 벤더 SDK를 컴포넌트가 직접 import하지 않는다
- [ ] `VITE_` 변수에 비밀값이 들어가 있지 않다
- [ ] `shared/`에 새로 추가된 게 있다면 팀장이 직접 추가했거나 관련 담당자와 협의한 것이다

(2026-08-27 작성 — `app/server/AGENTS.md`와 짝을 이루는 문서. 근거: "기능 담당자 통제성 확보"
원칙 — 폴더 안은 담당자 재량, 폴더 간 접점만 팀 공통 규칙으로 고정한다.)
