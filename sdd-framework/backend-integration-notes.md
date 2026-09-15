# 백엔드 통합 실전 노트 — Prisma · 로컬 dev-tooling · 알려진 함정

이 문서는 `integration-workflow.md`(features/*/prototype → app/ 포팅 절차)와 겹치지 않는다.
그 문서는 "새 기능을 처음 app/에 반영할 때" 절차이고, 이 문서는 **8개 기능이 이미 app/에
반영된 이후 단계** — 인메모리 저장소를 Prisma(Postgres/Supabase)로 바꾸고, 실제 서버를
띄워 로컬 QA를 돌리며 드러나는 버그를 고치고, 그 과정에 필요한 dev-tooling(시드 스크립트 등)을
정비하는 단계 — 에서 반복적으로 부딪힌 것들을 모은다. 다른 AI 툴이 이 단계 작업을 맡을 때
같은 실수를 반복하지 않도록 하는 게 목적이다. (2026-09-10 작성, `sdd-framework/evolution-rules.md`
기준 "완전히 새로운 개념"이라 새 문서로 분리 — 기존 문서(`integration-workflow.md`,
`app/server/AGENTS.md`)에 넣으면 그 문서들의 역할이 흐려진다.)

## 1. 지금 어느 단계인가

2026-09-09까지 8개 기능(user-management·project-management·applications·contracts-payments·
reviews·engagement·ai-pricing·notifications) 전부 `app/server`·`app/web`에 최소 1차 반영이
끝났다. 지금은:

- 각 기능의 인메모리 리포지토리를 Prisma 리포지토리로 교체하는 작업(대부분 완료, §2)
- 로컬에서 실제 Supabase 인증 + 실제 Postgres로 서버를 띄우고, 시드 계정으로 화면을 눌러보며
  나오는 버그를 고치는 작업(§5가 바로 이 과정에서 나온 실제 사례)
- 그 QA를 반복 가능하게 만드는 dev-tooling(시드 스크립트, DEV 위젯) 정비(§4)

가 동시에 진행 중이다. "diff를 반영한다"가 아니라 "서버를 돌려서 실패하는 지점을 찾는다"가
이 단계의 주된 작업 방식이라는 걸 먼저 이해해야 한다.

## 2. Prisma 리포지토리 패턴

- `app/server/src/shared/prisma-client.ts`의 `getPrismaClient()` — 모듈 스코프 싱글턴. `DATABASE_URL`
  없으면 호출 시점에 throw.
- `isPrismaConfigured(authProviderMode)` — `authProviderMode !== 'mock' && Boolean(DATABASE_URL)`
  둘 다 필요하다. **`AUTH_PROVIDER_MODE=mock`일 때는 `DATABASE_URL`이 있어도 절대 Prisma를 켜면
  안 된다** — mock 인증이 발급하는 유저 ID(`usr_000...001` 등)는 실제 DB에 없는 가짜라, Prisma를
  켜면 FK 위반으로 그 자리에서 깨진다.
- 각 기능 폴더 구조: `prisma-{기능}.repository.ts` + `in-memory-{기능}.repository.ts` 쌍,
  `express-app.ts`에서 `isPrismaConfigured(authProviderMode) ? new Prisma...() : new InMemory...()`
  게이트로 선택한다. 새 기능도 이 쌍을 그대로 따른다.
- **스키마를 고쳤으면 클라이언트 재생성이 필요하다.** 루트 `npm run dev`는 `predev` →
  `scripts/ensure-app-deps.js`의 `ensurePrismaClientFresh()`가 `schema.prisma`와 생성된 클라이언트의
  mtime을 비교해 자동으로 `npx prisma generate`를 돌려준다. **`app/server`에서 직접
  `npm run dev`를 실행하면 이 자동화를 타지 않는다** — 그럴 땐 `npm run prisma:generate`를 손으로
  먼저 돌린다.
- 마이그레이션 파일은 `app/server/prisma/migrations/`에 있다. 이 프로젝트는 로컬과 Vercel 배포가
  **같은 Supabase 프로젝트**를 보는 구조라(2026-09-10 확인), 마이그레이션은 보통 이미 적용된
  상태다 — 그래도 새 팀원 세팅이거나 마이그레이션이 안 맞아 보이면 실제 DB에 반영됐는지부터
  의심한다.
- **Prisma의 nested `create`는 `connectOrCreate`가 아니다** — 참조되는 행이 미리 있어야 한다.
  실제 사례: `ProjectSkill.skillId`가 `skills` 테이블을 FK로 참조하는데, 그 테이블이 한 번도
  시딩된 적이 없어서 프로젝트 등록마다 FK 위반으로 500이 났다(2026-09-10, `scripts/seed-skill-catalog.js`로
  해결). 새 참조 테이블을 추가했으면 시딩 스크립트도 같이 챙긴다.

## 3. 컨트롤러 에러 처리 — 두 가지 패턴이 공존한다 (여기서 서버 전체가 죽을 수 있다)

이 코드베이스엔 컨트롤러 스타일이 두 갈래로 갈려 있다.

**패턴 A (안전) — `res`를 직접 받아 그 안에서 끝맺는다.**
`project.controller.ts`·`project-contract.controller.ts`·`public-api.controller.ts`·
`bookmark.controller.ts`가 이 스타일이다. 각 핸들러가 `try { ... } catch (error) {
sendDomainError(res, error); }`로 끝나고, `sendDomainError()`가 인식 못 하는 에러도
`console.error`로 로깅한 뒤 제네릭 `500 INTERNAL_ERROR`로 응답을 직접 보낸다. 여기서 예외가
더 위로 새 나갈 길이 없다.

**패턴 B (위험했던 이력) — `{httpStatus, body}`를 리턴하는 프레임워크-비의존 컨트롤러.**
`application.controller.ts`·`pricing-analysis.controller.ts`가 이 스타일이다(원래 "HTTP 프레임워크와
무관한 controller" — 테스트하기 쉽게 하려는 의도였다). 이 구조에서 `toHttp(error)`류 헬퍼가
"인식 못 하는 에러는 `throw error`로 다시 던진다"로 짜여 있었는데, 이걸 부르는 라우터
(`application.router.ts`, `pricing-analysis.router.ts`)엔 자체 try/catch가 없다. 그러면:

1. 컨트롤러의 `catch` 블록 안에서 `throw` → 그 `catch`가 속한 `try`로 다시 안 들어가고 그대로
   밖으로 나간다.
2. 라우터의 Express async 핸들러 밖으로 새 나가 unhandled promise rejection이 된다.
3. 전역 `unhandledRejection` 핸들러가 없으면(2026-09-10 이전엔 없었다) Node가 **프로세스
   전체를 종료**시킨다.
4. 클라이언트(vite 프록시)엔 500도 아니고 `ECONNREFUSED`만 남는다 — 서버가 아예 죽어서
   재현·원인 추적이 훨씬 어렵다.

실제로 2026-09-10에 `ApplicationIdempotencyKey.bodyHash`가 `VarChar(64)`인데 저장하려는 값이
그보다 길어 Postgres가 거부한 게 이 경로로 서버 전체를 두 번 죽였다(§5 참고). 지금은 두 컨트롤러
모두 `toHttp()`가 미인식 에러를 로깅 + 제네릭 500으로 바꿔 막아뒀다. **새 컨트롤러를 패턴 B
스타일로 짠다면, 이 rethrow 함정을 제일 먼저 확인한다** — 패턴 A로 통일하는 것도 고려할 만하다.

방어선이 하나 더 있다: `app/server/src/dev-server.ts`에 `process.on('unhandledRejection'|'uncaughtException', ...)`
로깅이 있다(2026-09-10 추가, 로컬 전용 — 배포는 Vercel 서버리스라 이 파일을 안 쓴다). 이건
**최후의 안전망일 뿐**이다 — 이게 찍힌다는 건 위 두 패턴 중 하나가 새로 뚫렸다는 뜻이니, 로그를
보고 해당 컨트롤러의 에러 처리부터 고친다.

## 4. 로컬 개발 계정·시드 도구 체인

- `scripts/seed-dev-accounts.js` — 기능별 상태의 계정 10개(idempotent)를 만든다. 사용법은
  `scripts/seed-dev-accounts.md`.
- `scripts/seed-contractable-project.js` — 계약 가능 상태의 계정 1쌍 + 프로젝트 1개를 매번 새로
  만든다(non-idempotent). `scripts/seed-contractable-project.md`.
- `scripts/seed-skill-catalog.js` — `skills` 참조 테이블 시딩(§2 FK 사례의 해결책).
- `scripts/seed-all.js` — 위 셋을 순서대로 실행. `npm run seed:all`.
- **계정 생성은 Supabase Admin API(`auth.admin.createUser`) + Prisma 직접 INSERT로 한다 — 공개
  `signUp()`이 아니다** (2026-09-10 전환). 공개 `signUp()`은 Confirm Email이 켜져 있으면 매
  호출마다 실제 이메일 발송을 시도해 Supabase 기본 SMTP의 시간당 2통 제한에 걸렸고, 꺼두면
  서버가 그 상태를 설정 오류(`AUTH_CONFIGURATION_INVALID`)로 보고 회원가입 자체를 막는 구조라
  계정을 여러 개 한 번에 만들 방법이 없었다. Admin API는 이메일을 아예 안 보내서 이 제한과
  무관하다. 구현은 `scripts/lib/bootstrap-seed-user.ts`.
- **Windows에서 `node_modules/.bin/<패키지>`를 `execFileSync`로 직접 실행하면 `ENOENT`가 난다**
  — 확장자 없는 POSIX shebang 스크립트라 `cmd.exe`가 못 연다. 패키지의 실제 CLI 엔트리 파일
  (예: `node_modules/tsx/dist/cli.mjs`, `package.json`의 `"bin"` 필드 확인)을
  `execFileSync(process.execPath, [엔트리경로, ...args])`로 직접 불러야 OS 무관하게 동작한다.
- **DEV 로그인 위젯(`app/web/src/features/user-management/DevAuthToggle.tsx`)의 "시드 계정"
  목록은 리포 루트 `.dev-accounts.local.json`(`.gitignore`)을 읽는다.** 코드는 git pull로
  오지만 이 파일은 절대 안 온다 — 팀원마다 로컬에서 `npm run seed:dev-accounts`를 직접 한 번
  돌려야 위젯에 계정이 뜬다. "코드는 최신인데 위젯이 그대로다"라는 보고를 받으면 십중팔구 이
  파일 부재다.
- `.env` 필수값 체크리스트(로컬):
  - `AUTH_PROVIDER_MODE=supabase`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등 —
    시드 스크립트·Prisma·Admin API 전부 이게 있어야 동작
  - `INTERNAL_SERVICE_TOKEN` — 마감 처리(CLOSED)/자동거절 시드 시나리오 전용, 없어도 나머지
    8개 계정은 만들어짐
  - `OPENAI_API_KEY` + `OPENAI_PRICING_MODEL` + `OPENAI_PRICING_SCHEMA_MODELS` — **셋 다 있어야**
    AI 견적 생성(`POST /api/v1/pricing-analyses`)이 된다. 하나라도 비어 있으면 503
    `PRICING_ANALYZER_UNAVAILABLE`로 막힌다(`openai.adapter.ts`의 `configured` getter,
    §5 참고). 조회·예산 반영은 이 값과 무관하게 동작한다.

## 5. 알려진 함정 목록 (2026-09-10 기준, 전부 실제 재현·수정 완료)

| 증상 | 원인 | 파일 | 상태 |
|---|---|---|---|
| 회원가입 계정 10개를 한 번에 못 만듦, Confirm Email 딜레마 | 공개 `signUp()`이 시간당 2통 이메일 발송 제한에 걸림 | `scripts/lib/bootstrap-seed-user.ts` | Admin API 전환으로 해결 |
| Windows `spawnSync ... ENOENT` | `.bin/tsx`가 POSIX shebang, Windows가 직접 실행 못 함 | `scripts/seed-*.js` | `tsx` CLI 엔트리 직접 호출로 해결 |
| 프로젝트 등록 시 `500 INTERNAL_ERROR`(원인 불명) | `skills` 참조 테이블이 한 번도 시딩 안 됨 → FK 위반 | `prisma-project.repository.ts` | `seed-skill-catalog.js` 신설로 해결, 4개 컨트롤러에 로깅 추가 |
| 지원 생성 시 `VALIDATION_ERROR`(coverLetter) | 시드 스크립트 텍스트가 최소 100자에 5자 모자람 | `scripts/seed-dev-accounts.js` | 텍스트 길이 수정(규칙 자체는 정상 — `application.constants.ts` `COVER_LETTER_MIN`) |
| 마감 테스트 시나리오 `DEADLINE_BELOW_MINIMUM` | 등록 6초 뒤 마감으로 설계했는데 실제 규칙은 최소 1일 뒤 | `scripts/lib/backdate-project-deadline.ts` | 정상 마감시각으로 등록 후 Prisma로 타임스탬프만 과거로 되돌리는 방식으로 해결(규칙 자체는 안 건드림) |
| 지원 생성 시 서버 프로세스 전체 다운(`ECONNREFUSED`) | `bodyHash()`가 해시가 아니라 JSON 원문을 반환 → `VarChar(64)` 초과 → Postgres 22001 → 미인식 에러 rethrow → unhandled rejection | `application.service.ts`, `application.controller.ts` | sha256 해시로 교체 + toHttp() rethrow 제거로 해결 |
| `POST /api/v1/pricing-analyses` 503 | `OPENAI_PRICING_MODEL`/`OPENAI_PRICING_SCHEMA_MODELS` 미설정(`OPENAI_API_KEY`만 있어도 안 됨) | `.env`, `openai.adapter.ts` | 세 값 모두 채우면 해결(§4) |
| `POST /api/v1/pricing-analyses` 502, 원인 콘솔에 안 남음 | `openai.adapter.ts`가 OpenAI 실패 원인(status·body·예외)을 전부 버리고 `UNAVAILABLE`만 던짐 | `openai.adapter.ts` | status/body/모델명/예외를 로깅하도록 수정 — 실제 원인(모델명 오류 등)은 이 로그로 확인 |

이 표에 없는 새 함정을 발견하면 여기 행을 추가한다(파일 1개 확장, `evolution-rules.md`
"이미 있는 문서의 주제" 케이스).

## 6. 이 문서를 넘어서는 판단이 필요할 때

- DB 스키마·API 경로·도메인 용어처럼 되돌리기 비싼 결정은 `integration-workflow.md` 3단계
  원칙 그대로 — 팀장에게 묻는다.
- 새 아키텍처 결정(예: 컨트롤러 패턴 A/B 중 하나로 통일)이 필요하다고 판단되면 이 문서에
  적지 않고 `sdd-framework/adr-process.md` 기준으로 ADR을 새로 쓴다.
