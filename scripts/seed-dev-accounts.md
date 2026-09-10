# 기능별 시드 계정 — `seed-dev-accounts.js` + DEV 로그인 위젯

> `scripts/seed-contractable-project.md`와 겹치는 배경 설명(로컬 서버 준비물, 왜 샌드박스가
> 아니라 로컬에서 돌려야 하는지 등)은 그 문서를 먼저 읽으면 이해가 빠르다. 이 문서는 "여러
> 계정 중 골라 쓰는" 부분만 다룬다.

## 1. 이게 왜 필요한가 (Context)

`npm run dev`에서 mock 인증(N)을 고르면 실제 Supabase 인증으로 서버가 뜨는데, 그러면
화면마다 회원가입 → 이메일 확인 → 로그인을 매번 손으로 거쳐야 한다. 게다가 담당자마다
테스트하려는 화면이 다르다 — project-management 담당자는 "모집 중인 프로젝트"가 있는
계정이 필요하고, contracts-payments 담당자는 "계약 대기" 상태의 계정이 필요하다. 이
스크립트는 그 상태들을 미리 만들어 두고, 화면의 DEV 위젯에서 클릭 한 번으로 골라 로그인할
수 있게 한다.

## 2. 실행 방법

```bash
npm run seed:dev-accounts
```

`scripts/seed-contractable-project.md`의 준비물(서버가 `AUTH_PROVIDER_MODE=supabase`로
떠 있어야 함, `.env`의 `SUPABASE_*`·`DATABASE_URL`·`WEB_ORIGIN`)이 똑같이 필요하다.

실행할 때마다 계정이 늘어나지 않는다 — 이메일이 고정이라, 이미 있으면 그 계정을 그대로
재사용한다(idempotent). 서버를 재시작한 뒤에도 다시 돌려도 안전하다.

이 스크립트와 `scripts/seed-contractable-project.js`(매번 새 계정 1쌍 + CONTRACT_PENDING
프로젝트 1개를 추가로 만드는 non-idempotent 스크립트)를 한 번에 순서대로 실행하려면
`npm run seed:all`(`scripts/seed-all.js`)을 쓴다. 대부분은 이 문서의 10개 계정만으로
충분하니 평소엔 `npm run seed:dev-accounts`만 돌리면 된다.

## 3. 만들어지는 계정 10개

| 계정 | 역할 | 상태 | 어떤 화면 테스트용 |
|---|---|---|---|
| `client-fresh` | 의뢰인 | 프로젝트 없음 | user-management(프로필), ai-pricing(프로젝트 등록 전 AI 견적) |
| `freelancer-fresh` | 프리랜서 | 지원·북마크 없음 | user-management(프로필), engagement(프로젝트 탐색·북마크) |
| `client-recruiting` | 의뢰인 | 모집 중(RECRUITING) 프로젝트 1개 | project-management(수정·마감·재모집·취소), applications(지원 수락/거절) |
| `freelancer-applicant` | 프리랜서 | `client-recruiting`의 프로젝트에 지원(PENDING) | applications(내 지원 목록/상세) |
| `client-contract-pending` | 의뢰인 | CONTRACT_PENDING(지원 수락 직후) | contracts-payments 합의 제안 |
| `freelancer-contract-pending` | 프리랜서 | `client-contract-pending`과 짝 | contracts-payments 합의 수락 |
| `client-payment-ready` | 의뢰인 | 합의·서명 완료, 결제 준비(clientKey 발급)까지 | contracts-payments 결제~납품, reviews(4절 참고) |
| `freelancer-payment-ready` | 프리랜서 | `client-payment-ready`와 짝 | 위와 동일 |
| `client-recruitment-closed` | 의뢰인 | 모집 마감(CLOSED) 처리 완료 | project-management(마감된 프로젝트 화면), applications(자동거절 목록) — 5-1절 참고 |
| `freelancer-auto-rejected` | 프리랜서 | 마감으로 자동거절(AUTO_REJECTED) | applications(내 지원 목록의 AUTO_REJECTED 사유 표시) |

각 계정의 정확한 설명·이메일은 화면의 DEV 위젯에 그대로 표시된다(호버하면 설명 툴팁도
뜬다) — 이 표는 개요용이고, 실제 로그인은 위젯에서 클릭으로 한다.

### 3-1. `client-recruitment-closed` / `freelancer-auto-rejected`는 조건부다 (Fact)

이 두 계정은 `.env`에 `INTERNAL_SERVICE_TOKEN`이 있어야만 완전히 만들어진다. 이유:
CLOSED 상태로 만들려면 `POST /internal/v1/projects/sweep-deadlines`(마감 스윕)를 직접
호출해야 하는데, 이 경로는 서비스 간 호출 전용이라 `INTERNAL_SERVICE_TOKEN`을 Bearer
토큰으로 요구한다(`app/server/src/shared/require-service-token.ts`, 값이 없으면 서버가
503으로 거부).

`.env`에 값이 없으면: 스크립트는 죽지 않는다. 이 시나리오 하나만 건너뛰고 나머지 8개
계정은 그대로 만든다. 로그인 자체는 되지만(계정은 생성됨) 프로젝트가 없어
`.dev-accounts.local.json`의 해당 두 항목에 `projectId` 대신 `note`가 남는다. `.env`에
`INTERNAL_SERVICE_TOKEN`을 채우고 `npm run seed:dev-accounts`를 다시 돌리면 그때
마저 만들어진다(멱등이라 이미 만든 다른 8개는 건드리지 않는다).

동작 방식: 등록 직후(6초 뒤) 마감되도록 짧은 마감 시각으로 프로젝트를 만들고,
`freelancer-auto-rejected`가 지원(PENDING)한 뒤, 마감 시각이 지나길 실제로 기다렸다가
스윕 엔드포인트를 호출한다 — 그러면 프로젝트는 CLOSED로, 대기 중이던 지원은
AUTO_REJECTED로 바뀐다. 스크립트 실행 시간이 몇 초 더 걸리는 것은 이 대기 때문이다
(정상 동작).

## 4. `payment-ready` 계정의 한계 — 결제 확정부터는 수동이다 (Fact)

두 가지가 API만으로는 절대 안 된다(이미 `scripts/seed-contractable-project.md` 7-2절에
정리한 내용과 같다).

1. **결제 확정**: 실제 토스페이먼츠 결제위젯에서 실제로 결제(샌드박스 테스트 카드)를
   완료해야 `paymentKey`가 나온다. 스크립트 실행 마지막에 `clientKey`·`orderId`·`amount`가
   출력되니, 그 값으로 브라우저에서 결제를 완료한 뒤 그 결과 `paymentKey`로
   `POST /api/v1/payments/confirm`을 호출한다.
2. **정산 완료(RELEASED)**: 사용자 API에 아예 노출돼 있지 않다. 대신 이번에 dev 전용
   엔드포인트를 하나 열어 뒀다 — `POST /api/internal/dev/simulate-settlement`
   (`{ "paymentId": "..." }`). `express-app.ts`가 `!isProduction`일 때만 이 경로를
   등록하므로 배포 환경에는 존재하지 않는다. 이미 만들어져 있는 `publicApiService`
   인스턴스의 `simulateSettlementResult()`를 그대로 호출할 뿐, 별도 로직이나 DB 우회가
   아니다.

스크립트가 끝나면 이 두 단계를 그대로 실행할 수 있는 안내 문구(정확한 `curl` 명령 포함)를
출력한다. reviews 화면(완료된 거래에만 리뷰 작성 가능)을 테스트하려면 이 두 단계까지
마쳐야 한다 — 결제 준비까지만으로는 안 된다.

## 5. 화면에서 계정 고르기 (DEV 위젯)

`npm run dev`로 mock이 아닌 실제 인증으로 띄우면, 화면 우하단에 노란 테두리의 "DEV 로그인
위젯"이 뜬다(프로덕션 빌드에는 아예 안 들어간다).

- **드래그**로 원하는 위치로 옮길 수 있다 (헤더의 `⠿ DEV 로그인 위젯` 부분을 잡고 끈다).
  위치는 브라우저에 저장돼 새로고침해도 유지된다.
- **닫기**를 누르면 작은 "DEV" 배지로 접힌다 — 화면 테스트를 가릴 일이 없다. 배지를 다시
  누르면 펼쳐진다.
- 위젯 안에는 두 구역이 있다.
  - **mock 세션**: 기존 기능. 서버가 `AUTH_PROVIDER_MODE=mock`일 때만 통한다.
  - **시드 계정**: 이 문서가 다루는 최대 10개 계정(마감 처리 2개는 `INTERNAL_SERVICE_TOKEN`
    설정 여부에 따라 8개일 수도 있다). 기능별로 묶여서 나온다. 클릭하면 실제
    `POST /api/v1/auth/sessions`(로그인)이 호출된다 — mock과 달리 서버가 진짜 세션으로
    인식한다.
- 아직 `npm run seed:dev-accounts`를 안 돌렸으면 이 구역에 "시드 계정이 없습니다" 안내가
  뜬다.

## 6. 안전 관련 참고 (Fact)

- 10개 계정 모두 `@example.com` 가짜 이메일, 고정 비밀번호(`PactFiveSeedDev!1`)를 쓴다 —
  전부 코드에 그대로 있지만, 실제 사람에게 영향을 주는 값이 아니다(auth.mock.ts의 고정
  mock 토큰과 같은 성격).
- 결과 파일 `.dev-accounts.local.json`(리포 루트)은 `.gitignore`에 있어 커밋되지 않는다.
- `GET /api/internal/dev/test-accounts`·`POST /api/internal/dev/simulate-settlement`
  두 엔드포인트는 서버가 `NODE_ENV=production`이면 아예 등록되지 않는다
  (`app/server/src/express-app.ts`) — 배포 환경에서는 존재하지 않는 경로다.
- 이 스크립트도 로컬 PC에서 실행해야 한다 — 샌드박스에는 Supabase/DB로 나가는 네트워크가
  없다(`scripts/seed-contractable-project.md` 참고).
- `INTERNAL_SERVICE_TOKEN`은 다른 8개 계정과 무관한 서비스 간 인증 비밀값이다 — 각자
  `.env`에 임의의 문자열을 채우면 되고(로컬 전용이므로 값 자체는 중요하지 않다, 서버와
  스크립트가 같은 `.env`를 읽으므로 같은 값이기만 하면 된다), 커밋되는 코드에는 절대
  들어가지 않는다.

---

**작성 근거.** 계정 상태 설계는 각 기능의 `spec.md`(engagement·ai-pricing)와
`review.service.ts`(COMPLETED 전제 확인)를 직접 읽고 결정했다. dev 전용 엔드포인트 위치는
`app/server/src/express-app.ts`의 기존 `isPrismaConfigured`/`isProduction` 게이트 패턴을
그대로 따랐다. `POST /api/v1/payments/confirm`이 실제 토스 API를 호출한다는 사실은
`app/server/src/features/contracts-payments/toss-payments.adapter.ts`에서, 정산 시뮬레이션
함수가 라우트에 연결돼 있지 않다는 사실은 `public-api.service.ts`의
`simulateSettlementResult` 주석에서 그대로 확인했다.
