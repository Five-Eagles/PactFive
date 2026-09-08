# contracts-payments 피드백 — 2026-09-07 통합 (app/server + app/web, 서버·웹 단계 전체)

반영 커밋(prototype 기준): 28471d6 (PR #80. sync-log.md 이전 기록은 67207c8, 9/3)
sync-log.md 기록: 이 통합의 서버·웹 커밋을 모두 만든 뒤 한 번에 기록한다(마지막 커밋 메시지에
정확한 해시 반영).

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.

---

## 항목 1 — 정산 RELEASED 전이를 발생시키는 실제 트리거가 app/에 없다

상태: 미확인

**Fact — spec.md 규칙 24가 명시한 공백**
- "Sandbox 결과는 Mock `simulateSettlementResult`... 지급 버튼 없음"이라고 spec.md 자체가
  밝히고 있다 — 이 Increment는 애초에 결제 PAID → 정산 RELEASED로 넘기는 실제 버튼/자동
  트리거를 정의하지 않는다.

**어떻게 채웠는지**
- `public-api.service.ts`에 `simulateSettlementResult(paymentId, result)`를 HTTP 라우트 없이
  서비스 함수로만 구현해 뒀다(내부/테스트 호출용). 이 함수를 아무도 부르지 않으면 결제는
  영원히 PAID에 머물고, `completeProjectTransaction`(거래 완료)도 일어나지 않는다 —
  즉 지금 app/ 상태로는 납품 승인까지 UI로 끝까지 밟아도 "완료"까지는 못 간다.

**왜 그렇게 채웠는지 (근거)**
- spec.md·api-contract.md 둘 다 이 함수를 공개 HTTP로 노출하지 말라고 명시했다
  ("브라우저 경로가 아니다"). 임의로 관리자 라우트를 새로 만드는 것도 규칙 8(새 코드·새 경로
  신설 금지 원칙과 같은 취지)과 맞지 않아 보여 만들지 않았다.

**담당자 메모**
- 실제 정산 자동화(웹훅·배치·관리자 버튼 등)를 다음 Increment에서 어떻게 열지 조준영님
  확인 필요. 지금은 QA 때 이 함수를 직접 호출(스크립트/콘솔)해야 "완료" 상태까지 재현할 수
  있다.

---

## 항목 2 — projectTitle이 계속 빈 문자열이다 (기존 알려진 제한, 범위 넓어짐)

상태: 미확인

**Fact**
- 2026-09-03 기존 코드 주석에 이미 남아 있던 제한이다: `getProjectNegotiationContext`
  응답에 프로젝트 제목이 없어 `contract.projectTitleSnapshot`이 계속 `''`다.
- 이번 반영에서 `GetSettlementResponse.projectTitle`·`GetCancellationResponse.projectTitle`·
  `GetPaymentResponse.projectTitle`·`CurrentNegotiationOfferResponse.projectTitle` 4곳이
  새로 이 값을 노출하면서 영향 범위가 넓어졌다.

**어떻게 채웠는지**
- 전부 기존과 같은 자리표시자(`contract.projectTitleSnapshot`)를 그대로 사용했다.

**왜 그렇게 채웠는지 (근거)**
- 새 필드 추가 요청(negotiation-context에 projectTitle 추가)은 project-management
  소유(유동우) 결정이라 이 반영에서 임의로 계약을 바꾸지 않았다.

**담당자 메모**
- 화면(SET-01·CAN-01·PAY-01) 반영 때 빈 제목이 어떻게 보이는지 확인 필요 — 다음 웹 반영
  단계에서 빈 문자열을 안전하게 다루는지(플레이스홀더 문구 등) 점검한다.

---

## 항목 3 — invalidateAgreement 인바운드를 실제로 부르는 호출자가 아직 없다

상태: 미확인

**Fact**
- `POST /internal/v1/projects/:projectId/invalidate-agreement`는 spec.md 규칙 15·25가
  정한 대로 이번에 처음 app/server에 라우트를 열었다(`requireServiceToken` 보호).
- 하지만 이 경로를 호출하는 쪽(공개 프로젝트 취소 API, A-07)은 project-management(유동우)
  담당이고, app/에는 아직 그 공개 취소 엔드포인트 자체가 없다.

**어떻게 채웠는지**
- 라우트·서비스 로직만 먼저 열어 뒀다. curl 등으로 서버 간 토큰을 직접 넣어 호출하면
  동작을 확인할 수 있지만, 실제 사용자 플로우(취소 버튼 클릭)로는 아직 도달할 수 없다.

**왜 그렇게 채웠는지 (근거)**
- api-contract.md가 이 함수를 "유동우 → 조준영" 방향으로 이미 명세해 뒀고, 수신자(조준영)
  쪽 구현이 먼저 끝나 있어야 나중에 유동우 쪽 호출자를 붙일 때 계약이 안정적이다.

**담당자 메모**
- project-management의 A-07(공개 취소) 통합 시점에 이 엔드포인트를 그대로 호출하도록
  연결 필요.

---

## 항목 4 — 납품·정산·취소 3개 신규 화면은 시안(design/*.html)이 없다

상태: 미확인

**Fact**
- `features/contracts-payments/design/` 아래에는 합의·서명·결제 3개 시안만 있고, 이번에
  새로 반영한 납품(DLV-01)·정산 조회(SET-01 v2)·취소 조회(CAN-01 v2)는 시안 HTML이 없다.

**어떻게 채웠는지**
- `prototype/web/DeliveryPanel.tsx`(및 대응 정산·취소 프로토타입 컴포넌트가 있다면 그쪽)의
  마크업 구조를 보조 근거로 삼되, 클래스 표기는 이 기능이 이미 쓰고 있는
  `panel.css`(`.panel`·`.panel-head`·`.facts`·`.badge` 등)를 그대로 재사용해 새로 짰다.
  `panel.css`에는 재제안 이력·납품 파일·정산 내역이 공유하는 `.offer-history`·
  `.delivery-file`·`.settlement-breakdown`·`.history-*` 조각만 새로 추가했고, 전부 기존
  CSS 변수(design-tokens.md)만 참조한다 — 새 색상·레이아웃 단위를 만들지 않았다.

**왜 그렇게 채웠는지 (근거)**
- integration-workflow.md "시안이 상호작용 방식까지 정해 주지 않을 수 있다" 절 — 시안이
  없을 때는 기존 화면의 패턴을 최대한 재사용하고 새 판단은 여기 기록해 두라고 명시한다.

**담당자 메모**
- 조준영님이 이 3개 화면의 실제 시안을 나중에 만들면 지금 짠 마크업/클래스와 비교해
  차이가 있는지 확인 필요.

---

## 항목 5 — 정산 조회 화면이 paymentId를 URL 없이 `preparePayment` 재사용으로 얻는다

상태: 미확인

**Fact**
- 공개 GET 경로는 `/v1/payments/:paymentId/settlement`라 paymentId가 필요한데, 결제·서명
  화면과 같은 컨벤션(contract.routes.tsx)대로 URL에는 contractId만 쓰기로 했다.
- `preparePayment`는 결제가 이미 READY 또는 PAID 상태면 결제 게이트웨이를 다시 호출하지
  않고 기존 레코드의 `paymentId`를 그대로 돌려준다(public-api.service.ts 513행대,
  부작용 없음 — 서버 코드 변경 없이 기존 동작 그대로 확인했다).

**어떻게 채웠는지**
- `SettlementPage.tsx`가 `preparePayment(contractId)`로 paymentId를 얻은 뒤
  `fetchSettlement(paymentId)`를 호출한다. 결제 전(READY 아님)이거나 PENDING 상태면
  409로 실패해 loadFailed로 떨어지는데, 이 화면은 결제 완료 이후에만 링크될 예정이라
  실사용 경로에서는 발생하지 않는다고 판단했다.

**왜 그렇게 채웠는지 (근거)**
- 새 GET 경로(`/v1/contracts/:contractId/settlement`)를 신설하는 대신 이미 있는 idempotent
  엔드포인트를 재사용하는 쪽이 서버 계약을 넓히지 않는다 — 다만 이름이 "prepare"인 함수를
  조회 목적으로 쓰는 것이 어색하다는 판단은 남아 있다.

**담당자 메모**
- 이 방식이 어색하다고 판단되면, 다음 Increment에서 contractId 기반 정산 조회 GET을
  서버에 신설하는 편이 더 명확할 수 있다 — 조준영님 검토 필요.

---

## 항목 6 — check:design이 이미 알려진 `.success` 클래스 드리프트를 계속 보고한다 (범위 밖)

상태: 확인됨 (조치 불필요 — 사전에 알려진 이슈)

**Fact**
- `node scripts/check-design-drift.js` 실행 결과, `applications`·`contracts-payments`·
  `reviews` 3개 기능의 시안이 `shared/ui/tokens.css`에 없는 `.success` 클래스를 쓴다는
  경고가 이번 반영 이전부터 이미 존재했다(이번 웹 반영에서 새로 만든 파일이 원인이 아니다
  — 시안 원본 `design/*.html`에 있는 클래스라 이 반영 범위 밖이다).

**어떻게 채웠는지**
- 손대지 않았다. 새로 만든 `SettlementPanel.tsx`·`DeliveryPanel.tsx`·`CancellationPanel.tsx`는
  `.helper.success`(기존 `panel.css` 규칙)만 쓰고 독립된 `.success` 클래스를 새로 쓰지 않는다.

**왜 그렇게 채웠는지 (근거)**
- 이 드리프트는 여러 기능에 걸친 공용 디자인 시스템 결정 사항이라 이번 contracts-payments
  단일 기능 통합 범위에서 임의로 고치지 않는다.

**담당자 메모**
- 팀 전체 디자인 시스템 정리 작업(향후 별도 CR)에서 `.success` 토큰 추가 여부를 결정할 때
  같이 처리.

---
