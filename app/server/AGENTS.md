# app/server/ — 백엔드 구조 지침 (팀장 전용)

이 폴더는 실제 배포되는 백엔드 코드입니다. 팀원은 이 폴더를 직접 수정하지 않습니다 — 상위
지침(권한·통합 절차)은 `app/AGENTS.md` 참고. 아키텍처 결정 근거는
`docs/decisions/0007-backend-serverless-architecture.md`.

## 배포 아키텍처 — 이중 진입점

Express `app`은 순수 모듈로 작성한다 (`app.listen()`을 이 파일 안에서 호출하지 않는다).
배포 진입점을 분리한다:

- `app/server/src/app.ts` — Express `app` 생성·라우트 등록·미들웨어. `export default app;`만
  한다. `app.listen()` 없음.
- `app/server/api/index.ts` (Vercel 서버리스 진입점) — `app.ts`의 `app`을 import해 그대로
  `export default app`. Vercel Node 런타임이 Express `app`을 `(req, res)` 핸들러로 인식하므로
  별도 어댑터가 필요 없다.
- `app/server/src/server.ts` (독립 서버 진입점, 필요해지면 추가) — `app.ts`의 `app`을 import해
  `app.listen(PORT)` 한 줄만 추가한다. 비즈니스 로직 재작성 없음 — 이 파일 하나 추가/삭제로
  서버리스 ↔ 독립 서버 전환이 끝난다.

컨트롤러/서비스/레포지토리 계층 구조와 파일명 규칙은 이 결정으로 바뀌지 않는다 —
`docs/naming-convention.md` §6, `features/sample-login/prototype/server/` 그대로 따른다.

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
