# app/server/ — 백엔드 구조 지침 (팀장 전용)

이 폴더는 실제 배포되는 백엔드 코드입니다. 팀원은 이 폴더를 직접 수정하지 않습니다 — 상위
지침(권한·통합 절차)은 `app/AGENTS.md` 참고. 아키텍처 결정 근거는
`docs/decisions/0007-backend-serverless-architecture.md`.

## 배포 아키텍처 (2026-09-06 개정 — 표준 `/api` 서버리스 함수 방식)

Express `app`은 순수 모듈로 작성한다 (`app.listen()`을 이 파일 안에서 호출하지 않는다).
배포 진입점을 분리한다:

- `app/server/src/express-app.ts` — Express `app` 생성·라우트 등록·미들웨어. `export default
  app;`만 한다. `app.listen()` 없음.
- `app/server/api/index.js` (빌드 산출물, git에 없음) — `npm run build`/`postinstall`이
  esbuild로 `express-app.ts`를 번들링해 만든다. Vercel의 표준 Node.js 서버리스 함수 컨벤션이
  `/api` 폴더 안의 파일을 그대로 함수로 배포한다 — `export default app`으로 내보낸 Express
  `app`은 Vercel Node 런타임이 `(req, res)` 핸들러로 그대로 인식하므로 별도 어댑터가 필요
  없다.
- `app/server/src/dev-server.ts` (독립 서버 진입점) — `express-app.ts`의 `app`을 import해
  `app.listen(PORT)` 한 줄만 추가한다. 비즈니스 로직 재작성 없음 — 이 파일 하나 추가/삭제로
  서버리스 ↔ 독립 서버 전환이 끝난다.

컨트롤러/서비스/레포지토리 계층 구조와 파일명 규칙은 이 결정으로 바뀌지 않는다 —
`docs/naming-convention.md` §6, `features/sample-login/prototype/server/` 그대로 따른다.

**Vercel Dashboard 필수 설정 — 이 프로젝트(app/server)의 Framework Preset은 반드시 "Other"로
둔다.** "Express"로 두면 안 되는 이유는 바로 아래 "결정 기록" 참고 — 요약하면 "Express"
프리셋은 우리 esbuild 번들을 무시하고 원본 소스를 직접 배포해버린다.

### 결정 기록 — Framework Preset을 "Express"에서 "Other"로 바꾼 이유 (2026-09-06)

**문제**: 배포된 백엔드가 모든 요청에서 `ERR_MODULE_NOT_FOUND: Cannot find module
'.../auth.routes'`로 크래시했다. 빌드 로그는 매번 성공(`esbuild` 성공 로그까지 찍힘)했는데
실제 요청은 매번 죽어서, "빌드는 되는데 배포된 산출물이 실행이 안 되는" 것처럼 보였다.

**원인(Fact, 공식 문서로 확인함 — https://vercel.com/docs/frameworks/backend/express)**:
Vercel의 "Express" Framework Preset은 zero-config 기능으로, Root Directory 기준
`app.*`/`index.*`/`server.*`/`src/app.*`/`src/index.*`/`src/server.*` 중 존재하는 파일을
**자동으로 찾아 그 파일 자체를 서버리스 함수로 배포한다** — `/api` 폴더나 `vercel.json`
없이도 동작하게 만든 기능이다. 그리고 이 프리셋은 **애플리케이션 번들링(Webpack/Rollup
등)을 하지 않는다** — 불필요한 파일만 걷어낼 뿐 상대경로 import 구조를 그대로 둔 채
개별 트랜스파일만 한다.

우리 `tsconfig.json`은 `moduleResolution: "bundler"`라 상대경로 import에 확장자가 없어도
타입체크는 통과하지만(`from './features/.../auth.routes'`), 실제 Node ESM
런타임(`"type": "module"`)은 확장자 없는 상대경로를 못 찾는다. `/api`에 esbuild로 번들링한
결과물을 만들어 뒀었지만, **Vercel은 애초에 `/api`를 보지도 않고 (당시 이름이었던)
`src/app.ts`를 zero-config로 직접 찾아 배포하고 있었다** — 번들은 항상 성공적으로
만들어졌지만 한 번도 실제로 실행되지 않았다.

**검토한 대안**:
1. 실제 소스 파일 이름을 Vercel의 zero-config 감지 목록에서 벗어나게 바꾸고(`app.ts` →
   `express-app.ts`, `server.ts` → `dev-server.ts`), 번들 산출물을 감지 목록 중 하나인
   `app/server/index.js`로 내서 "Express" 프리셋을 그대로 유지 — 1차로 이렇게 고쳐서 동작은
   확인했다.
2. (**채택**) Framework Preset을 "Other"로 바꿔 zero-config 자동 감지 자체를 끄고, Vercel의
   가장 표준적인 `/api` 폴더 컨벤션으로 되돌린다.

**대안 1을 기각한 이유(Opinion)**: 동작은 하지만, 파일 이름 금기 규칙("`app.ts`/`index.ts`/
`server.ts`류를 쓰면 안 된다")을 팀 전원이 앞으로도 계속 기억해야 하는 유지보수 부담이
남는다. 이건 Vercel 고유의 잘 알려지지 않은 동작에 의존하는 방식이라, 5인·부트캠프 규모
팀에서 각자 이해하고 지키기엔 과하다(`sdd-framework/constitution.md` 원칙 6). `/api` 방식은
Vercel에서 가장 표준적이고 문서가 많은 배포 모델이라 동작이 파일 위치만 봐도 명시적이고,
이 사고 같은 재발 위험이 사실상 없다.

**결정**: `/api` 방식(대안 2)으로 확정. 파일 이름은 `express-app.ts`/`dev-server.ts`를 그대로
유지한다 — 표준 방식으로 옮긴 뒤에는 이름 자체는 문제되지 않지만, 이미 바꾼 이름이 "이 파일이
`app.listen()`을 하는지 아닌지"를 이름만 보고 구분하기 더 쉬워서 유지하기로 했다.

**향후 조건**: 만약 나중에 Vercel Dashboard에서 이 프로젝트의 Framework Preset이 다시
"Express"로 바뀌는 일이 생기면(실수로든, Vercel 쪽 기본값 변경으로든) 이 사고가 그대로
재발한다 — 배포 후 이상 동작이 보이면 제일 먼저 이 설정부터 확인한다.

**적용 방법**: esbuild가 `express-app.ts`를 `app/server/api/index.js`로 번들링한다(모든
상대경로 import가 한 파일로 합쳐지므로 확장자 문제 자체가 없다 — npm 패키지는
`--packages=external`로 번들에 안 넣고 node_modules를 그대로 쓴다). `app/server/api/index.js`
는 git에 커밋하지 않는다(`.gitignore`), 매 설치/빌드마다(`postinstall`/`build`) 새로
생성된다. `app/server/api/`에는 소스(`.ts`)를 두지 않는다 — 이 폴더에는 항상 번들 산출물만
있어야 한다. 배포 전에는 반드시 로컬에서 `npm run build`를 돌려 `node api/index.js`를 직접
import해보고 안 죽는지 확인한다.

## 외부 벤더 연동 (Supabase Auth·토스페이먼츠·OpenAI)

세 벤더 모두 인터페이스(포트) 뒤에 둔다 — 컨트롤러·서비스에서 벤더 SDK를 직접 import하지
않는다 (근거·대안 비교: `docs/decisions/0009-external-vendor-interface-layer.md`,
`docs/naming-convention.md` §6).

| 접점 | 인터페이스 | 어댑터 |
|---|---|---|
| 인증 | `auth.port.ts` (`AuthProvider`) | `supabase-auth.adapter.ts` |
| 결제 | `payment.port.ts` (`PaymentGateway`) | `toss-payments.adapter.ts` |
| AI 단가분석 | `pricing-analyzer.port.ts` (`PricingAnalyzer`) | `openai.adapter.ts` |

구체 어댑터는 `app/server/src/app.ts`(조립 지점) 한 곳에서만 연결한다. `prototype/run.tsx`의
Mock 테스트는 실제 벤더 대신 인터페이스를 구현한 가짜 어댑터를 쓴다 — 벤더 API 키 없이도
테스트가 통과해야 한다.

## DB 연결

Supabase 연결 문자열은 반드시 connection pooling(PgBouncer) 모드를 쓴다. 일반 direct
connection 문자열을 서버리스 함수에서 쓰면 매 요청마다 새 커넥션이 생겨 커넥션 풀이 고갈된다.
환경 변수명은 `docs/naming-convention.md` §12 기준 `DATABASE_URL`.

## 서버리스 제약 (구현 시 유의)

- 콜드 스타트: 한동안 요청이 없던 뒤의 첫 요청은 느리다.
- 실행 시간 제한이 있다 (플랫폼·플랜별로 다름).
- 인메모리 세션·캐시를 쓸 수 없다 — 매 요청이 독립적이다.
- 웹소켓 등 장기 연결은 지원되지 않는다. 실시간 push가 필요해지면 Supabase Realtime 등
  별도 채널을 검토한다 (현재 PRD 범위 밖).

## 모노레포 배포 설정 (2026-08-24 확정)

`app/web`·`app/server`는 같은 git 레포 안에 있다(모노레포). Vercel에는 프로젝트를 2개
연결한다 — 하나는 Root Directory를 `app/web`으로, 다른 하나는 `app/server`로 지정한다.
같은 레포를 두 프로젝트가 각자 다른 하위 폴더를 루트 삼아 보는 방식이라, npm workspaces 같은
별도 도구 없이도 동작한다. RFP 제출 가이드의 "GitHub 리포지토리 링크(클라이언트/서버)"는 같은
레포의 `app/web`, `app/server` 하위 경로 링크로 충족한다.

npm workspaces는 지금 도입하지 않는다 — 지금은 `app/web`·`app/server`가 서로 의존성을 공유할
일이 거의 없고, 도입 자체가 팀 규모(5인·22일) 대비 과한 선제 작업이다(`sdd-framework/
constitution.md` 원칙 6). 두 폴더 사이에 공유 코드(타입 정의 등)가 실제로 필요해지는 시점에
`change-requests/`로 재검토한다.

## 인증 방식 (2026-08-24 확정)

Supabase Auth를 채택했다 (근거·대안 비교: `docs/decisions/0008-auth-method-supabase-auth.md`).
자체 JWT 대신 Supabase Auth의 내장 로그인·세션·OAuth 프로바이더(Google·Kakao)를 사용한다.
Access/Refresh Token 발급·자동 재발급은 Supabase 클라이언트 SDK가 처리한다.

**단, 탈퇴 계정 거부·소셜 전용 계정 거부 같은 PactFive 고유 규칙은 Supabase가 대신 판단해주지
않는다.** 로그인 성공 이후 앱 레이어에서 별도로 체크하는 코드가 필요하다 — user-management
담당자가 `features/user-management/spec.md`에 이 규칙들을 번호 매긴 항목으로 명시하고,
`prototype/run.tsx`에서 각 규칙을 테스트한다 (`sdd-framework/feature-workflow.md` 절차 그대로).

Kakao OAuth는 Kakao 개발자 앱을 "사업자" 상태로 전환해야 이메일 동의 항목을 요청할 수 있다 —
Supabase가 아니라 Kakao 자체 정책이므로 미리 확인해야 한다.

`features/sample-login/`은 기존에 자체 JWT 방식으로 작성돼 있어 Supabase Auth 방식으로
다시 써야 한다 (아직 미반영).

(근거: ADR-0007·ADR-0008, 2026-08-24)

## 배포 오리진 — Vercel Rewrite로 동일 출처화 (2026-09-03 확정)

`app/web`·`app/server`는 각각 Vercel 프로젝트지만, 커스텀 도메인을 쓰지 않고 Vercel이
자동으로 주는 `*.vercel.app`을 그대로 쓰기로 했다. `*.vercel.app`은 Public Suffix List에
있어 두 프로젝트의 도메인이 **서로 다른 사이트**로 취급된다 — `__Host-pactfiveRefreshToken`
같은 `__Host-` 쿠키는 그 상태로는 브라우저가 크로스 사이트 요청에 안정적으로 실어주지
않는다(근거·기각한 대안: `docs/decisions/0013-web-origin-same-origin-rewrite.md`).

그래서 `app/web/vercel.json`에 `/api/*` → `app/server` 배포 URL로 넘기는 rewrite를 둔다.
브라우저는 항상 `app/web` 도메인에만 요청하고, Vercel 엣지가 서버 쪽에서 `app/server`로
프록시한다 — 로컬 개발의 `app/web/vite.config.ts` `/api` 프록시(→ `localhost:3000`)와
같은 사고방식을 배포 환경까지 그대로 유지하는 것이다.

**아직 안 끝난 부분**: `app/web/vercel.json`의 `destination`은 자리표시자다. Vercel
프로젝트를 실제로 만들어 `app/server`의 실제 배포 URL을 알아야 채울 수 있다 — 개발
배포(Preview)·프로덕션 배포 각각 실제 URL로 교체해야 한다.

`WEB_ORIGIN` 환경 변수(CORS 허용 목록 + 이메일 인증 리다이렉트 URL의 기반, `app.ts` 참고)는
이 rewrite와 별개로 계속 쓴다 — rewrite는 브라우저 트래픽을 동일 출처로 만들 뿐, `app/server`를
직접 호출하는 경로(수동 테스트 등)에 대한 방어는 여전히 CORS 허용 목록이 한다. 값은 3단계로
채운다 — 로컬은 `.env`(`http://localhost:5174`), 개발/프로덕션 배포는 커밋되지 않는 Vercel
프로젝트 자체의 환경 변수로 등록한다(`.env.example`에는 값을 넣지 않는다).
