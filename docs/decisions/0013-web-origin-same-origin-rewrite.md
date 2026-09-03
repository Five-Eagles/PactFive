# ADR-0013: 배포 환경의 app/web↔app/server 접점 — Vercel Rewrite로 동일 출처화

| 항목 | 내용 |
|---|---|
| 상태 | 확정 |
| 작성 | 팀장 + AI 협업자 |
| 날짜 | 2026-09-03 |
| 관련 결정 | ADR-0007 백엔드 배포 아키텍처(Vercel 프로젝트 2개), ADR-0008 인증 방식(Supabase Auth) |

---

## 1. 배경 (Context)

ADR-0007이 Vercel에 `app/web`·`app/server`를 별도 프로젝트 2개로 배포하기로 확정했지만,
"모노레포 여부 미정" 리스크만 해소됐을 뿐 **두 프로젝트가 실제로 어떤 도메인 관계로
배포되는가**는 그때 정해지지 않았다. 이번에 로컬 `.env`의 `WEB_ORIGIN`(CORS 허용 목록·
이메일 인증 리다이렉트 URL의 기반)을 3단계(로컬/개발 배포/프로덕션 배포)로 채우려다 이
질문과 정면으로 마주쳤다.

이 질문은 단순 설정값 문제가 아니다 — `app/server`가 로그인 이후 발급하는 Refresh Token이
`__Host-pactfiveRefreshToken`이라는 HttpOnly 쿠키다(ADR-0008, user-management 구현). 두
프로젝트가 어떤 도메인 관계로 배포되느냐에 따라 이 쿠키가 브라우저에서 실제로 전달되는지
여부가 갈린다 — `feedback_loop/2026-08-27/user-management.md` 항목 3에서 오민혁이
"배포 환경(다른 오리진)에서 로그인 자체가 끊어질 수 있다"고 재이슈로 남긴 지점이 바로
이것이다.

2026-09-03, 팀장이 **커스텀 도메인을 구매하지 않고 Vercel이 자동으로 주는 `*.vercel.app`
도메인을 그대로 쓰기로** 결정했다 — 이 결정이 아래 문제를 확정적으로 드러냈다.

## 2. 문제 정의 (Problem)

`vercel.app`은 Public Suffix List(PSL)에 등록된 도메인이다 — 즉 `pactfive-web.vercel.app`과
`pactfive-server.vercel.app`은 같은 사이트(site)가 아니라 **서로 다른 사이트**로 취급된다
(등록 가능한 도메인 하나 아래 여러 조직이 각자 하위 도메인을 받는 `github.io`와 같은 부류).

이게 왜 문제인가:

- `__Host-` 접두사 쿠키는 정확히 그 쿠키를 설정한 호스트로만 돌아온다(Domain 속성 자체를
  가질 수 없다). `app/server`(`pactfive-server.vercel.app`)가 이 쿠키를 설정해도,
  브라우저가 `app/web`(`pactfive-web.vercel.app`)에서 `app/server`로 보내는 요청은
  **크로스 사이트 요청**이다.
- 크로스 사이트 요청에 쿠키를 실으려면 `SameSite=None; Secure`가 필요한데, 이마저도 최신
  브라우저의 서드파티 쿠키 차단 정책(Chrome Privacy Sandbox 등) 대상이 될 수 있어 "설정은
  맞는데 특정 브라우저·설정에서만 조용히 안 온다"는, 배포 후에야 드러나는 위험이 크다.
- `shared/http.ts`가 이미 `credentials: 'include'`로 이 문제를 프론트 쪽에서는 준비해
  뒀지만(오민혁, 2026-08-27), 그건 "쿠키를 실어 보내겠다"는 요청 쪽 설정일 뿐 브라우저가
  실제로 실어 주느냐는 위 사이트 관계에 달려 있다 — 프론트 코드만으로는 못 고친다.

## 3. 검토한 대안 (Options)

### 대안 A — Vercel Rewrite로 동일 출처화 (BFF-lite) (채택)

`app/web`의 `vercel.json`에 `/api/*` 요청을 `app/server`의 실제 배포 URL로 넘기는 rewrite
규칙을 둔다. 브라우저는 항상 `app/web`의 도메인에만 요청하고, Vercel 엣지가 서버 쪽에서
`app/server`로 프록시한다 — 브라우저 관점에서는 **완전히 동일 출처(same-origin)** 요청이라
사이트 경계 자체가 없다.

장점: 커스텀 도메인 구매 없이 `*.vercel.app` 그대로 쓰면서 문제를 해결한다. 로컬 개발이
이미 이 패턴이다(`app/web/vite.config.ts`의 `/api` 프록시 → `localhost:3000`) — 배포
환경에서도 같은 사고방식을 유지해 "로컬에서는 되는데 배포하면 안 된다"는 환경 간 불일치를
없앤다. CORS 설정 자체도 사실상 필요 없어진다(브라우저가 cross-origin으로 인식하지
않으므로).

단점: `app/server`의 실제 배포 URL을 알아야 rewrite 대상을 채울 수 있다 — Vercel
프로젝트를 실제로 만들기 전에는 정확한 값을 못 채운다(아래 §6 참고). Preview(개발 배포)
환경은 배포마다 URL이 바뀌므로, 안정된 별칭(alias) 도메인을 쓰거나 두 프로젝트를 같은
git 브랜치 흐름에 맞춰 배포해야 한다 — 첫 배포 시 실측이 필요하다.

### 대안 B — 커스텀 도메인 + 서브도메인 (예: `app.pactfive.com` / `api.pactfive.com`)

같은 등록 도메인 아래 서브도메인으로 나누면 "같은 사이트, 다른 오리진"이 되어
`SameSite=None`이 아니라 `SameSite=Lax`로도 크로스 오리진 쿠키가 안정적으로 동작한다.

장점: 가장 표준적이고 신뢰도 높은 해법. 단점: **팀장이 커스텀 도메인을 구매하지 않기로
이미 정했다** — 학생 캡스톤 프로젝트 규모·기간(22일) 대비 도메인 구매·DNS 설정 비용이
지금 얻는 이득에 비해 크다고 판단했다. 이 결정 자체가 대안 A를 사실상 유일한 선택지로
좁혔다.

### 대안 C — HttpOnly 쿠키 포기, Refresh Token을 응답 본문으로 전달

크로스 사이트 쿠키 문제를 아예 피하려고 Refresh Token을 JSON 응답에 실어 클라이언트가
직접 저장(메모리·`localStorage` 등)하게 바꾼다.

장점: 사이트 경계 문제에서 완전히 자유로워진다. 단점: HttpOnly 쿠키를 쓰던 이유(XSS로 토큰이
탈취되지 않게 하는 것)를 포기하는 셈이라 보안 트레이드오프가 크다. `app/server`·
`app/web` 양쪽의 인증 흐름을 다시 설계해야 해서 ADR-0008이 이미 확정한 결정을 뒤집는
비용도 크다. 근거 없이 기각 — 대안 A로 원래 설계(HttpOnly 쿠키)를 그대로 살릴 수 있는데
이 비용을 감수할 이유가 없다.

## 4. 결정 (Decision)

대안 A(Vercel Rewrite로 동일 출처화)를 채택한다. `app/web/vercel.json`에 `/api/*` →
`app/server` 배포 URL 프록시 규칙을 둔다. 로컬 개발의 vite 프록시와 동일한 사고방식을
배포 환경까지 일관되게 유지한다.

근거: 팀장이 커스텀 도메인을 쓰지 않기로 이미 결정한 상태에서, `__Host-` 쿠키·
`SameSite=None`의 크로스 사이트 신뢰성 문제를 코드 변경 없이(ADR-0008 인증 설계를
그대로 유지하며) 해결하는 유일한 대안이기 때문이다.

## 5. 남은 리스크 (Risk — 미해결)

- **`app/server`의 실제 배포 URL을 아직 모른다.** Vercel 프로젝트를 실제로 만들어야 정확한
  값을 알 수 있다 — 지금은 `app/web/vercel.json`에 자리표시자만 넣어 뒀다.
- **Preview(개발 배포) 환경의 URL 안정성.** Vercel은 브랜치·PR마다 새 Preview URL을 만드는
  게 기본값이다. `app/web`의 Preview 배포가 `app/server`의 어느 Preview 배포를 가리켜야
  하는지 첫 배포 때 실제로 확인해야 한다 — 안정된 별칭을 쓰거나, 개발 배포는 당분간 develop
  브랜치의 고정 Preview만 쓰는 식으로 좁힐 수도 있다(실측 후 결정).
- **CORS 설정을 완전히 제거하지는 않는다.** rewrite는 브라우저 트래픽을 해결하지만,
  `app/server`를 직접 호출하는 경로(수동 테스트·향후 다른 클라이언트)가 있을 수 있어
  `WEB_ORIGIN` 기반 CORS 허용 목록은 방어적으로 유지한다.

## 6. 영향받는 문서/구조 — 구현 기록 (참고용, 결정 내용 아님)

> 아래는 이 결정이 실제로 어떻게 실행됐는지에 대한 기록이다. §4~§5의 결정 내용을 바꾸는
> 것이 아니다 (`sdd-framework/adr-process.md`의 ADR 불변성 규칙 참고).

- `app/web/vercel.json` 신규 — rewrite 규칙 자리표시자, Vercel 프로젝트 생성 후 실제 URL로
  교체 필요.
- `app/server/AGENTS.md`에 이 결정을 반영하는 절 추가.
- `.env.example`·`.env`에 `WEB_ORIGIN` 섹션 추가 — 로컬 값(`http://localhost:5174`)은
  채웠고, 개발/프로덕션 배포 값은 Vercel 프로젝트 생성 후 각 환경의 대시보드에 직접
  등록한다(커밋되는 `.env.example`에는 넣지 않는다).
- `feedback_loop/2026-08-27/user-management.md` 항목 3(오민혁 재이슈)에 이 ADR을 참고하도록
  팀장 응답을 남겼다.
