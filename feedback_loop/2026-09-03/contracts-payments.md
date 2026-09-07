# contracts-payments 피드백 — 2026-09-03 통합

반영 커밋(prototype 기준): 67207c8
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

이번 통합은 `sync-log.md` 2026-09-01 항목이 스스로 예고해 둔 미반영분(공개 API 초안
negotiation-offers·contracts·payments 7종, 웹 패널 3종)을 마무리한 것이다 — 새 CR 문서 없이
sync-log 자체에 적혀 있던 "다음 통합 대상"을 처리했다.

---

## 항목 1 — 프리랜서 본인 확인을 지원서 단위로 못 한다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `acceptNegotiationOffer`·`rejectNegotiationOffer`·서명·결제 조회는 "의뢰인이 아닌 그 거래의
  프리랜서만" 허용해야 하는데, `acceptedApplicationId`가 실제로 어떤 사용자의 지원인지 조회할
  방법이 이 기능에 없다 — applications 기능이 아직 `app/`에 통합되지 않았다
  (`App.tsx`의 `NOT_INTEGRATED_ROUTES`에 여전히 있음).

**어떻게 채웠는지**
- `app/server/src/features/contracts-payments/public-api.service.ts`: `acceptNegotiationOffer`를
  처음 호출한, 의뢰인이 아닌 인증된 사용자를 그 거래의 프리랜서로 확정해 `contract.freelancerId`에
  기록한다. 이후 서명·결제 조회는 그렇게 확정된 두 당사자(`clientId`/`freelancerId`)만 허용한다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장 판단. `acceptedApplicationId`를 대조할 포트가 없는 상태에서 진행을 막지
  않기 위한 잠정 조치다. **남은 위험**: 의뢰인이 아닌 제3의 인증된 사용자가 먼저
  accept를 호출하면 그 사람이 프리랜서로 확정돼 버린다 — 지금은 막을 방법이 없다.
  applications 기능이 `app/`에 붙으면 `getProjectNegotiationContext`(또는 별도 조회)에
  수락된 지원자의 user id를 포함시켜 이 서비스가 대조하도록 바꿔야 한다.

**담당자 메모**
-

---

## 항목 2 — 계약의 프로젝트 제목이 빈 문자열이다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `GetContractResponse.termsSnapshot.projectTitle`을 채우려면 프로젝트 제목이 필요한데,
  내부 계약 `getProjectNegotiationContext`(project-management 소유, api-contract.md 정본)
  응답에 제목 필드가 없다.

**어떻게 채웠는지**
- 계약 생성 시 `projectTitleSnapshot`·`termsSnapshot.projectTitle`을 빈 문자열로 둔다.
  화면(`AgreementPage`·`ContractSignPage`·`PaymentPage`)은 빈 값이면 "프로젝트"로 대체
  표시한다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장 판단. `negotiation-context`는 project-management가 정의를 잠근 계약이라
  이번 반영에서 임의로 필드를 추가하지 않았다(2026-08-28 contracts-payments 항목 1과 같은
  이유로, 상태의 주인이 함수 모양을 정한다는 원칙을 지켰다). **제안**: `recruitmentDeadlineAt`
  옆에 `projectTitle`을 추가하는 것이 가장 적은 변경이다 — project-management 쪽 확인 필요.

**담당자 메모**
-

---

## 항목 3 — 화면 URL 모양을 이번에 새로 정했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- api-contract.md는 `/api/v1/...` API 경로만 정의하고, 화면(라우트) URL은 정의하지 않았다.
  `design/*.html` 상단 `.meta` 문구의 `/projects/:projectId/agreements` 같은 표기는 시안
  메모일 뿐 확정 계약이 아니었다.

**어떻게 채웠는지**
- `app/web/src/features/contracts-payments/contract.routes.tsx`에서 확정:
  `/projects/:projectId/agreements`(합의) · `/contracts/:contractId/sign`(서명) ·
  `/contracts/:contractId/payment`(결제). 결제 화면은 시안 메모의
  `/projects/:projectId/payments/:paymentId`를 따르지 않았다 — `paymentId`는 계약에서
  서버가 자동으로 만들어 URL에 넣을 이유가 없다.

**왜 그렇게 채웠는지 (근거)**
- project-management의 `project.routes.tsx` 패턴(자원 id를 경로에 두고 화면 진입 시 서버가
  파생값을 채운다)과 일관되게 맞췄다.

**담당자 메모**
-

---

## 항목 4 — [참고] 변형 클래스 표기가 project-management/engagement와 다르다

상태: 미확인

**Fact**
- `npm run check:design`이 기존부터(오늘 새로 생긴 게 아니라 `features/contracts-payments/
  design/_tokens.css`가 만들어진 시점부터) 이 사실을 보고하고 있었다: contracts-payments·
  reviews는 변형 클래스를 `.btn.primary`처럼 공백으로 쓰고, project-management·engagement는
  2026-08-28부터 BEM(`.btn--primary`)으로 쓴다. `.success`류 톤 클래스는 `shared/ui/
  tokens.css`에 아예 없다.

**어떻게 채웠는지**
- 통합을 막지 않기 위해 두 표기를 섞지 않았다. `app/web/src/features/contracts-payments/`에
  로컬 `ui.tsx`·`panel.css`를 따로 두어 이 기능만 시안의 공백 표기를 그대로 쓰고,
  `shared/ui/primitives.tsx`(BEM)는 건드리지 않았다. 오버레이·다이얼로그만 두 표기가 같아
  `shared/ui/tokens.css`의 기존 규칙을 재사용했다.

**왜 그렇게 채웠는지 (근거)**
- 프로젝트 전체 표기를 하나로 합치는 것은 이 통합의 범위를 넘는 결정이라 팀 논의가 필요하다
  (조준영·오정훈[reviews] 양쪽 시안을 다시 만들어야 할 수도 있다). 지금은 공존시켰다.

**담당자 메모**
-

---

## 항목 5 — PG 미설정 시 503으로 먼저 끊는다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- api-contract.md는 `PG_SECRET_KEY`가 없을 때 결제 준비·확정 API가 어떤 응답을 줘야 하는지
  정의하지 않았다.

**어떻게 채웠는지**
- `app/server/src/shared/require-service-token.ts`의 fail-closed 패턴과 같게, `PG_SECRET_KEY`가
  없으면 `/api/v1/payments`·`/api/v1/payments/confirm`을 503
  `PAYMENT_GATEWAY_NOT_CONFIGURED`로 먼저 끊는다(`public-api.controller.ts`의
  `requirePgConfigured`). `PaymentPanel`의 "연동 준비 중"(키 없음) 화면이 이 응답을 받는다.

**왜 그렇게 채웠는지 (근거)**
- `toss-payments.adapter.ts` 자체 주석("키 없이 조용히 성공하는 가짜 결제보다 끊기는 쪽이
  안전하다")과 같은 원칙을 그대로 확장했다.

**담당자 메모**
-
