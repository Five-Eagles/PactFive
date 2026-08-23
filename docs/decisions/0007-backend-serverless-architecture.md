# ADR-0007: 백엔드 배포 아키텍처 — Express + 서버리스 이중 진입점

| 항목 | 내용 |
|---|---|
| 상태 | 확정 |
| 작성 | 팀장 + AI 협업자 |
| 날짜 | 2026-08-24 |
| 관련 결정 | ADR-0004 리포지토리 폴더 구조, ADR-0006 app/ 폴더 접근 권한 |

---

## 1. 배경 (Context)

2026-08-24 기술 스택 확정 논의에서 프론트엔드(React·TypeScript·Vite·Tailwind·React Router)·
DB(Supabase)·결제(토스페이먼츠 sandbox)·AI 단가분석(OpenAI)까지는 빠르게 합의됐다. 백엔드
(Express·TypeScript)의 배포 방식에서 논의가 멈췄다 — RFP §7.2가 "GitHub 연동 자동 배포"를
요구하는데, Express를 상시 실행 서버(Render/Railway 등)로 올릴지 서버리스로 배포할지가 갈렸다.

## 2. 문제 정의 (Problem)

백엔드를 서버리스로 배포하면서, 이미 `features/sample-login/prototype/server/`에 만들어 둔
controller/service/repository 3계층 구조(`docs/naming-convention.md` §6, ADR-0006)를 그대로
재사용할 수 있는가. 재사용이 안 되면 8개 기능 담당자가 이미 익힌 패턴을 버리고 새 패턴을 다시
배워야 한다. 팀장은 "나중에 독립 서버를 따로 띄울 수도 있다"는 가정 하에 서버리스를 먼저
쓰고 싶다는 요구를 명시했다.

## 3. 검토한 대안 (Options)

### 대안 A — Express 유지 + 상시 실행 서버 (Render/Railway 등)

Express 패턴을 그대로 두고 `app.listen()`으로 상시 실행한다.

장점: 가장 익숙한 방식이고 서버리스 제약(콜드스타트, 커넥션 관리 등)이 없다.
단점: 별도 인프라를 계속 띄워둬야 해서 5인·22일 규모 대비 운영 부담이 크고, 팀장이 원한
"서버리스로 먼저 배포"라는 요구와 맞지 않는다.

### 대안 B — Vercel 서버리스 + Express 유지, 이중 진입점 (채택)

Express `app` 객체(라우트·컨트롤러·서비스·미들웨어)는 순수 모듈로 유지하고, 배포 진입점만
서버리스용/독립 서버용으로 분리한다.

장점: 기존 3계층 구조와 naming-convention §6·§7을 전부 재사용한다. 나중에 독립 서버로 전환할
때 진입점 파일 하나만 추가하면 되고 비즈니스 로직 재작성이 없다. Vercel Node 런타임은 Express
`app`을 별도 어댑터 없이 `(req, res)` 핸들러로 그대로 인식한다.
단점: 서버리스 자체의 제약(§5 참고)은 그대로 안고 간다.

### 대안 C — Express 제거 + 개별 API Route로 재설계

요청 경로마다 독립된 서버리스 함수 파일로 다시 짠다.

장점: 콜드스타트가 상대적으로 작고 플랫폼 관례에 더 맞는다.
단점: 지금 있는 패턴과 문서(naming-convention §6, sample-login 예시)를 전부 다시 써야 한다.
8개 기능 담당자가 이미 넘은 학습 곡선을 갈아엎는 비용이 크다.

### 대안 D — Supabase Edge Functions

DB(Supabase)와 같은 생태계에 백엔드 로직을 둔다.

장점: DB·백엔드가 한 플랫폼 안에 있다.
단점: Deno 런타임이라 지금까지 Node 기준으로 짠 naming-convention·prototype 코드와 문법이
달라 재작성이 필요하고, 팀에 추가 학습 비용이 생긴다.

## 4. 결정 (Decision)

대안 B(Vercel 서버리스 + Express 유지, 이중 진입점)를 채택한다. `app/server/`는 Express
`app`을 export하는 순수 모듈로 두고, 배포 진입점(서버리스용/독립 서버용)만 분리한다.

근거: 기존 3계층 구조와 문서 자산을 그대로 재사용하면서, "나중에 독립 서버로 전환할 수 있다"는
팀장의 명시적 요구사항을 파일 추가만으로 충족하는 유일한 대안이기 때문이다.

## 5. 남은 리스크 (Risk — 미해결)

- **인증 방식 미정**: Supabase Auth를 쓸지, 자체 JWT(`docs/naming-convention.md` §12의
  `JWT_ACCESS_SECRET` 등)를 유지할지 아직 결정되지 않았다. `features/sample-login/`의 기존
  프로토타입은 자체 JWT 방식이다 — Supabase Auth로 정해지면 sample-login부터 다시 써야 한다.
- **모노레포 여부 미정**: `package.json` 설명에 이미 명시된 미결 사항이다. 이 ADR의 결정(진입점
  분리)은 모노레포 여부와 무관하게 동일하게 적용되어 이 결정을 막지는 않지만, `app/web`·
  `app/server`의 실제 배포 설정 파일 위치는 모노레포 결정 이후 확정한다.
- **DB 커넥션 관리 미검증**: Supabase의 connection pooling(PgBouncer) 연결 문자열을 실제로
  써봐야 서버리스 환경에서 연결 고갈이 없는지 확인 가능하다. 구현 착수 후 실측이 필요하다.
- notifications 기능이 실시간 push를 요구하게 되면(현재 PRD 범위 밖) 서버리스는 웹소켓을
  지원하지 않으므로 Supabase Realtime 등 별도 채널이 필요하다 — 지금 결정에는 영향 없으나
  향후 확장 시 참고한다.

## 6. 영향받는 문서/구조 — 구현 기록 (참고용, 결정 내용 아님)

> 아래는 이 결정이 실제로 어떻게 실행됐는지에 대한 기록이다. §4~§5의 결정 내용을 바꾸는
> 것이 아니다 (`sdd-framework/adr-process.md`의 ADR 불변성 규칙 참고).

- **`app/server/AGENTS.md`** (기존 0바이트 → 작성): 이중 진입점 구조, 파일 배치, Supabase
  커넥션 풀링 요구사항을 명시.
- **`docs/naming-convention.md`**: 진입점 파일명 규칙을 추가할지는 실제 구현 착수 시
  재검토한다 (지금은 과한 사전 규정을 피한다 — `sdd-framework/constitution.md` 원칙 6).

## 7. 진행 상황 갱신 — 구현 기록 (참고용, 결정 내용 아님)

> §4~§5의 결정 내용을 바꾸는 것이 아니다. 결정 이후 실제로 진행된 사실만 남긴다.

- **2026-08-24, 모노레포 여부 확정**: 팀장이 모노레포로 확정했다. §5의 "모노레포 여부 미정"
  리스크는 해소됐다 — 실제 배포 설정(Vercel 프로젝트 2개, `app/web`·`app/server`를 각각
  Root Directory로 지정)은 `app/server/AGENTS.md`에 반영했다.
- **인증 방식은 여전히 미정이다.** 다만 "누가 정하는가"는 명확히 했다 — 인증 *방식*
  (Supabase Auth vs 자체 JWT) 자체는 모든 기능의 API 인증에 영향을 주는 cross-cutting
  결정이라 팀장이 새 ADR로 정하고, 오민혁(user-management 담당)은 그 결정을 로그인·회원가입
  세부 스펙으로 반영하는 역할로 정리했다 (`app/server/AGENTS.md` 참고).
