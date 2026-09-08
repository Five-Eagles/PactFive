# 시드 계정 스크립트 — `seed-contractable-project.js`

> 이 문서는 `scripts/seed-contractable-project.js`가 무엇을 왜 하는지, 어떻게 실행하는지
> 설명한다. 개발 지식이 없어도 읽을 수 있도록 용어를 풀어 썼다 (팀 운영 지침 "비전문가
> 기준 설명 원칙").

---

## 1. 이게 왜 필요한가 (Context)

`contracts-payments`(합의 → 서명 → 결제 → 납품 → 정산) 기능을 실제 데이터베이스로
테스트하려면, 먼저 "계약 대기(CONTRACT_PENDING)" 상태의 프로젝트가 있어야 한다. 즉:

- 의뢰인 계정 1개
- 프리랜서 계정 1개
- 그 의뢰인이 등록한 프로젝트 1개
- 그 프리랜서가 지원하고, 의뢰인이 수락한 지원서 1개

이 4가지가 갖춰진 상태에서만 "합의 화면", "서명 화면" 같은 이후 단계를 테스트할 수 있다.
그런데 이걸 매번 화면을 클릭하며 손으로 만들면 느리고, 회원가입 시 오는 확인 이메일까지
직접 열어야 해서 더 번거롭다. 이 스크립트는 그 준비 과정을 자동화한다.

## 2. 어떻게 만드는가 (Concept) — "가짜 데이터를 심는" 게 아니다

**Fact.** 이 스크립트는 데이터베이스에 값을 직접 밀어 넣지 않는다. 대신 실제로 떠 있는
서버의 API(회원가입 → 로그인 → 프로젝트 등록 → 지원 → 지원 수락)를 화면 대신 코드로
순서대로 호출한다. 화면에서 손으로 클릭하는 것과 서버 입장에서는 동일하다 — 그래서 결과로
만들어지는 데이터도 실제 서비스 로직(검증, 상태 전이 규칙 등)을 그대로 통과한 "진짜"
데이터다.

유일하게 건너뛰는 절차는 **회원가입 확인 이메일 클릭**이다. 실제 메일함을 열어 링크를
누를 수 없으므로, 이 부분만 Supabase(로그인/회원 인증을 대신 처리해주는 외부 서비스)의
관리자 기능으로 "이 계정은 이미 확인된 것으로 처리해줘"라고 요청한다. 그 뒤 로그인은
다시 실제 로그인 API로 진행한다.

## 3. 실행 전 준비물 (Options / Prerequisites)

| 항목 | 설명 |
|---|---|
| 로컬 서버 실행 | `npm run dev`(또는 `dev:run`)로 서버가 떠 있어야 한다. **mock 인증(N 대신 y로 답한 경우)이 아니라 실제 Supabase 인증 모드**여야 한다 — mock 모드는 가짜 고정 계정만 인식해서 새 계정을 만들 수 없다. |
| `DATABASE_URL` | 리포 루트 `.env`에 실제 Supabase Postgres 주소가 채워져 있어야 한다. |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | 리포 루트 `.env`에 채워져 있어야 한다. `SERVICE_ROLE_KEY`는 서버 전용 비밀값이니 외부에 공유하지 않는다. |
| `WEB_ORIGIN` | 리포 루트 `.env`에 채워져 있어야 한다 (회원가입/로그인 API가 요청 출처를 검사한다). |

**Assumption.** 이 4가지는 이미 다른 기능(Prisma 리포지토리 작업) 때문에 `.env`에 채워져
있을 것으로 가정한다 — 값이 비어 있으면 스크립트가 시작하자마자 어떤 값이 없는지 알려주고
멈춘다.

## 4. 실행 방법 (Next Action)

리포 루트에서:

```bash
npm run seed:contractable
```

서버가 기본 포트(3000)가 아닌 다른 주소에 떠 있다면:

```bash
SERVER_BASE_URL=http://localhost:4000 npm run seed:contractable
```

## 5. 실행하면 무슨 일이 일어나는가

1. 의뢰인 계정 1개, 프리랜서 계정 1개를 새로 만든다 (이메일은
   `pactfive.seed.client.<임의문자열>@example.com` 형태 — 실행할 때마다 매번 새 계정이
   생긴다. 기존 계정과 절대 충돌하지 않는다).
2. 각 계정으로 실제 로그인까지 마쳐서 접근 토큰(access token)을 받는다.
3. 의뢰인 계정으로 테스트용 프로젝트 1개를 등록한다.
4. 프리랜서 계정으로 그 프로젝트에 지원한다.
5. 의뢰인 계정으로 그 지원을 수락한다 — 이 순간 프로젝트가 "계약 대기" 상태로 바뀐다.
6. 마지막에 아래와 같은 정보를 터미널에 출력한다.

```json
{
  "projectId": "...",
  "applicationId": "...",
  "client": { "userId": "...", "email": "...", "password": "...", "accessToken": "..." },
  "freelancer": { "userId": "...", "email": "...", "password": "...", "accessToken": "..." }
}
```

## 6. 출력된 정보를 어떻게 쓰는가

- `accessToken`을 그대로 `Authorization: Bearer <토큰>` 헤더에 넣어 curl/Postman/브라우저
  개발자도구로 `contracts-payments`의 나머지 API(합의 제안·수락, 서명, 결제 준비/확정,
  납품 요청/승인, 정산, 취소)를 순서대로 호출하며 테스트한다.
- `email` / `password`는 실제 로그인 화면에서 그대로 로그인해 눈으로 화면 테스트할 때도
  쓸 수 있다.
- `accessToken`은 시간이 지나면 만료된다. 만료되면 같은 `email`/`password`로
  `POST /api/v1/auth/sessions`(로그인)를 다시 호출하면 새 토큰을 받을 수 있다 — 이번에는
  로컬 사용자 정보가 이미 있으므로 한 번의 로그인 호출로 끝난다.

## 7. 안전 관련 참고 (Fact)

- 이 계정들은 `@example.com` 도메인의 테스트 계정이다. 실제 사람에게 메일이 가지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`(관리자 권한 키)는 스크립트 실행 중 로컬 프로세스 안에서만
  쓰이고, 어디에도 전송하거나 기록하지 않는다.
- 이 스크립트는 Anthropic 샌드박스 안에서 실행할 수 없다 — 샌드박스에는 Supabase/DB로
  나가는 네트워크가 막혀 있다. 반드시 팀장 로컬 PC에서 실행해야 한다.
- 운영(production) 환경을 향해 실행하지 않는다 — `SERVER_BASE_URL`을 배포 주소로 바꿔
  실행하면 실제 서비스에 테스트 계정/프로젝트가 그대로 생긴다. 로컬 개발 서버에서만
  쓴다.

## 8. 문제가 생기면 (Troubleshooting)

| 증상 | 원인 추정 |
|---|---|
| `.env에 SUPABASE_URL이(가) 없습니다` 등 시작하자마자 종료 | 리포 루트 `.env`에 해당 값이 비어 있음 |
| `회원가입 요청 실패` | 서버가 mock 인증 모드로 떠 있거나, 서버가 안 떠 있음 |
| `Supabase에서 방금 만든 계정을 찾지 못했습니다` | `SUPABASE_SERVICE_ROLE_KEY`가 잘못됐거나, 다른 Supabase 프로젝트를 보고 있음 (`.env`의 `SUPABASE_URL`과 실제 프로젝트가 일치하는지 확인) |
| `프로젝트 등록 실패` / `지원 실패` / `지원 수락 실패` | 서버 로그를 확인 — `DATABASE_URL`이 실제 Prisma 스키마와 맞지 않거나(마이그레이션 미적용), 검증 규칙에 걸렸을 수 있다 |

---

**작성 근거.** 회원가입/로그인 API의 정확한 요청·응답 형태는
`app/server/src/features/user-management/auth.service.ts`·`auth.controller.ts`·
`auth.types.ts`를, 프로젝트 등록은 `project-management/project.controller.ts`·
`project.service.ts`를, 지원/수락은 `applications/application.router.ts`·
`application.service.ts`를 직접 읽고 확인했다. 카테고리 값(`WEB_DEVELOPMENT` 등)과
기술 스택 값(`REACT`, `NODEJS` 등)은 `project-management/in-memory-external.adapter.ts`의
허용 목록에서 그대로 가져왔다.
