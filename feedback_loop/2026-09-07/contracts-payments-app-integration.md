# contracts-payments 피드백 — 2026-09-07 통합 (app/server, 서버 단계)

반영 커밋(prototype 기준): 28471d6 (PR #80. sync-log.md 이전 기록은 67207c8, 9/3)
sync-log.md 기록: 없음 — 서버 단계만 끝났고 웹 반영이 남아 있어 통합 전체가 끝난 뒤 한 번에 기록한다.

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
