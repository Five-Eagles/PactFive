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
그런데 이걸 매번 화면을 클릭하며 손으로 만들면 느리다. 이 스크립트는 그 준비 과정을
자동화한다.

## 2. 어떻게 만드는가 (Concept) — 계정은 직접 만들고, 나머지는 실제 API로

**Fact (2026-09-10 변경).** 계정 2개(의뢰인·프리랜서)만 `scripts/lib/bootstrap-seed-user.ts`가
Supabase Admin API(`auth.admin.createUser`)로 Auth 계정을 만들고 로컬 `users` 테이블
행도 Prisma로 직접 INSERT한다 — 원래는 서버의 공개 회원가입(signUp) API를 거쳤는데,
Confirm Email이 켜져 있으면 그 호출마다 Supabase가 실제 확인 이메일을 보내려 시도해
시간당 2통 제한에 걸렸고, 꺼져 있으면 서버가 그 상태 자체를 설정 오류로 보고 막아버렸다
(원인·판단 근거는 `scripts/lib/bootstrap-seed-user.ts` 헤더 주석 참고). `auth.admin.createUser`는
확인 이메일을 아예 보내지 않는 별도 경로라 이 문제와 무관하다.

계정 2개를 제외한 나머지(프로젝트 등록 → 지원 → 지원 수락)는 여전히 실제로 떠 있는
서버의 API를 화면 대신 코드로 순서대로 호출한다 — 이 부분은 값을 직접 밀어 넣지 않는다.
화면에서 손으로 클릭하는 것과 서버 입장에서는 동일하고, 결과로 만들어지는 데이터도 실제
서비스 로직(검증, 상태 전이 규칙 등)을 그대로 통과한 "진짜" 데이터다 — `ApplicationOperation`
같은 감사·멱등성 기록까지 정상적으로 남는다는 뜻이다.

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
   `pactfive.seed.client.<임의문자열>@pactfive-dev-seed.com` 형태 — `SEED_EMAIL_DOMAIN`
   env로 도메인을 바꿀 수 있다(원래 `@example.com`이었지만 Supabase Auth가
   `email_address_invalid`로 거부해서 2026-09-10에 바꿨다). 실행할 때마다 매번 새 계정이
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

## 7. 이 시드 계정으로 테스트할 수 있는 범위 (Scope)

**Fact.** 스크립트가 끝나면 프로젝트가 "계약 대기(CONTRACT_PENDING)" 상태이고, 그 다음부터는
`contracts-payments` 기능의 공개 API 14종을 실제로 순서대로 호출할 수 있다. 단, **API로
끝까지 되는 구간**과 **API만으로는 끝까지 안 되는 구간**이 나뉜다 — 후자를 모르고
테스트하면 "왜 안 되지"에서 시간을 쓰게 되므로 먼저 밝혀둔다.

### 7-1. API 호출만으로 끝까지 되는 구간

아래 순서대로, 누가(의뢰인/프리랜서) 호출해야 하는지까지 표로 정리했다. `{projectId}`는
스크립트 출력의 `projectId`, `{contractId}`는 2단계(합의 수락) 응답에 담겨 온다.

| 단계 | 호출자 | 메서드/경로 | 핵심 입력 | 비고 |
|---|---|---|---|---|
| 1. 합의 제안 | 의뢰인 | `POST /api/v1/projects/{projectId}/negotiation-offers` | `amount`(숫자) | **첫 제안은 반드시 의뢰인만** 할 수 있다 (코드가 강제) |
| 1-1. (선택) 재제안 | 상대방 | `POST /api/v1/projects/{projectId}/negotiation-offers/{offerId}/counter` | `amount`, `expectedRound`(직전 offer의 `round`) | 방금 제안한 사람은 재응답 불가(403) |
| 2. 합의 수락 | 프리랜서 | `POST /api/v1/projects/{projectId}/negotiation-offers/{offerId}/accept` | `expectedRound` | 이 호출로 `Contract`(DRAFT)가 생성된다 — 응답의 `contractId`를 저장해 둔다. **의뢰인이 아닌 첫 accept 호출자가 그대로 "그 계약의 프리랜서"로 기록된다**(7-3 참고) — 그러니 반드시 프리랜서 계정으로 호출한다 |
| 3. 서명 | 의뢰인, 프리랜서 각 1회 | `POST /api/v1/contracts/{contractId}/sign` | (본문 없음) | 양쪽 다 서명해야 `SIGNED`로 바뀐다 |
| 4. 결제 준비 | 의뢰인 또는 프리랜서(계약 당사자면 누구든) | `POST /api/v1/payments` | `contractId` | 응답에 `paymentId`·`orderId`·`clientKey` |
| 5. 납품 업로드 준비 | 프리랜서 | `POST /api/v1/contracts/{contractId}/deliveries/upload-prepare` | `fileName`,`contentType`,`size`,`sha256`(64자리 16진수 — 실제 파일 없이도 임의 문자열로 테스트 가능) | 응답에 `uploadId`·`objectKey` |
| 6. 납품 요청 | 프리랜서 | `POST /api/v1/contracts/{contractId}/deliveries/request` (헤더 `Idempotency-Key` 필수) | `objectKey`,`uploadId`(5단계 응답 값 그대로),`message` | |
| 7. 납품 승인 | 의뢰인 | `POST /api/v1/contracts/{contractId}/deliveries/approve` (헤더 `Idempotency-Key` 필수) | `expectedVersion`(선택) | |
| 조회용 | 양쪽 다 | `GET /api/v1/projects/{projectId}/negotiation-offers/current`, `GET /api/v1/contracts/{contractId}`, `GET /api/v1/payments/{paymentId}`, `GET /api/v1/payments/{paymentId}/settlement`, `GET /api/v1/contracts/{contractId}/delivery`, `GET /api/v1/projects/{projectId}/cancellation` | — | 상태 확인용 GET들 |

### 7-2. API만으로는 끝까지 안 되는 구간 — Fact

- **결제 확정(`POST /api/v1/payments/confirm`)**: `orderId`·`amount`와 함께 실제
  `paymentKey`가 필요한데, 이 값은 토스페이먼츠 결제위젯에서 실제로 결제(샌드박스 테스트
  카드)를 완료해야만 발급된다. 즉 4단계에서 받은 `clientKey`로 **브라우저에서 결제 위젯을
  띄우는 화면 테스트가 한 번은 필요**하다 — curl/Postman만으로는 여기서 막힌다.
- **정산 완료(RELEASED) 전이**: 코드에 `simulateSettlementResult()` 함수가 있지만
  "브라우저 경로가 아니다 — HTTP 라우트로 노출하지 않는다"는 주석과 함께 **어떤 API
  경로에도 연결돼 있지 않다**. 즉 결제가 `PAID`까지 가더라도, 정산이 `RELEASED`로
  넘어가는 걸 API 호출로는 재현할 수 없다 — 이건 사람이 만든 테스트용 지름길이 아직 없다는
  뜻으로, 이미 알려진 기능 공백이다 (자동 정산 트리거 부재는 이전에도 보고된 항목).

### 7-3. 알려진 설계상 제약 — Fact

`public-api.service.ts` 상단 주석에 명시된 제약: 지원 수락(applications 기능) 시점에
"어떤 프리랜서가 수락됐는지"를 contracts-payments가 조회할 방법이 없어서, **합의를
수락(accept)하는 첫 번째 비-의뢰인 사용자를 그대로 그 계약의 프리랜서로 기록**한다. 이번
시드 스크립트는 프리랜서 계정 하나만 만들고 그 계정이 지원·합의수락을 모두 하므로 문제가
되지 않지만, 여러 프리랜서 계정으로 확장 테스트를 하려는 경우에는 "지원을 넣은 사람"과
"합의를 수락하는 사람"이 자동으로 일치하지 않는다는 점을 알고 있어야 한다.

## 8. 안전 관련 참고 (Fact)

- 이 계정들은 `SEED_EMAIL_DOMAIN`(기본 `@pactfive-dev-seed.com`) 도메인의 테스트 계정이다.
  실제 사람에게 메일이 가지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`(관리자 권한 키)는 스크립트 실행 중 로컬 프로세스 안에서만
  쓰이고, 어디에도 전송하거나 기록하지 않는다.
- 이 스크립트는 Anthropic 샌드박스 안에서 실행할 수 없다 — 샌드박스에는 Supabase/DB로
  나가는 네트워크가 막혀 있다. 반드시 팀장 로컬 PC에서 실행해야 한다.
- 운영(production) 환경을 향해 실행하지 않는다 — `SERVER_BASE_URL`을 배포 주소로 바꿔
  실행하면 실제 서비스에 테스트 계정/프로젝트가 그대로 생긴다. 로컬 개발 서버에서만
  쓴다.

## 9. 문제가 생기면 (Troubleshooting)

| 증상 | 원인 추정 |
|---|---|
| `.env에 SUPABASE_URL이(가) 없습니다` 등 시작하자마자 종료 | 리포 루트 `.env`에 해당 값이 비어 있음(`DATABASE_URL` 포함, 2026-09-10부터 필수) |
| `Supabase/DB 계정 부트스트랩 실패` | `scripts/lib/bootstrap-seed-user.ts` 실패 — 메시지에 원인이 그대로 담긴다. `SUPABASE_SERVICE_ROLE_KEY`가 잘못됐거나 다른 Supabase 프로젝트를 보고 있거나(`.env`의 `SUPABASE_URL` 확인), `DATABASE_URL`이 실제 Prisma 스키마와 맞지 않는 경우가 흔하다 |
| `프로젝트 등록 실패` / `지원 실패` / `지원 수락 실패` | 서버가 mock 인증 모드로 떠 있거나 안 떠 있음. 그게 아니면 서버 로그를 확인 — `DATABASE_URL`이 실제 Prisma 스키마와 맞지 않거나(마이그레이션 미적용), 검증 규칙에 걸렸을 수 있다 |

---

**작성 근거.** 회원가입/로그인 API의 정확한 요청·응답 형태는
`app/server/src/features/user-management/auth.service.ts`·`auth.controller.ts`·
`auth.types.ts`를, 프로젝트 등록은 `project-management/project.controller.ts`·
`project.service.ts`를, 지원/수락은 `applications/application.router.ts`·
`application.service.ts`를 직접 읽고 확인했다. 카테고리 값(`WEB_DEVELOPMENT` 등)과
기술 스택 값(`REACT`, `NODEJS` 등)은 `project-management/in-memory-external.adapter.ts`의
허용 목록에서 그대로 가져왔다. 7절(테스트 가능 범위)은
`contracts-payments/public-api.routes.ts`·`public-api.controller.ts`·
`public-api.service.ts`를 직접 읽고 확인했다 — 특히 결제 확정에 실제 `paymentKey`가
필요하다는 점과 `simulateSettlementResult()`가 어떤 라우트에도 연결돼 있지 않다는 점은
코드와 코드 주석에서 그대로 확인한 사실(Fact)이며, 팀장의 추정이 섞이지 않았다.
