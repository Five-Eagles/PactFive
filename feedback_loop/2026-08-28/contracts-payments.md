# contracts-payments 피드백 — 2026-08-28 통합

반영 커밋(prototype 기준): 47c7760
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — [충돌] `startProjectTransaction`·`completeProjectTransaction` 입력에 `contractId`가 빠져 있었다

상태: 미확인

**Fact — 무엇이 어긋났나**
- 이쪽 `project-transaction.types.ts`의 `StartProjectTransactionInput` ·
  `CompleteProjectTransactionInput`은 공통 봉투 + `expectedProjectVersion`뿐이다.
- project-management의 `api-contract.md`는 두 주소 모두 **본문에 `contractId` 필수**로 정하고
  있고, `prototype/server/ports/project-transaction.port.ts`도 같다("본문에 contractId가
  필수다. 멱등 키에서 잘라 쓰지 않는다 — 2026-08-25 합의"). 구현도 없으면 422를 낸다.
- 즉 이 타입 그대로 호출하면 **모든 요청이 422로 거절된다.** 이전 통합에서는 라우트를
  contracts-payments가 직접 서빙했고 인메모리 대행이 `contractId`를 보지 않아 드러나지 않았다.

**어떻게 채웠는지**
- 두 입력 타입에 `contractId: string`을 추가했다
  (`app/server/src/features/contracts-payments/project-transaction.types.ts`).

**왜 그렇게 채웠는지 (근거)**
- PRD §5.1 원칙 1 — "상태에는 주인이 있다. 바꾸고 싶으면 주인이 제공하는 함수를 호출한다."
  함수의 모양도 제공자가 정한다. 이미 공개된 제공자 계약에 호출자를 맞춘 것이지, 새 계약을
  만든 것이 아니다.
- `prototype/`도 같은 수정이 필요하다 — 원본을 고치지 않으면 다음 통합에서 되돌아온다.

**담당자 메모**
-

---

## 항목 2 — [충돌] `restoredFields`가 튜플로 고정돼 있어 제공자 응답을 다 담지 못한다

상태: 미확인

**Fact — 무엇이 어긋났나**
- 이쪽 `RestorePreContractProjectResponse.restoredFields` 타입이
  `["recruitmentStatus", "transactionStatus"]` **튜플**이다.
- project-management는 상황에 따라 `acceptedApplicationId` · `paymentPendingAt`도 함께 비우고
  그 사실을 `restoredFields`에 담아 보낸다 (근거:
  `features/project-management/change-requests/0002`). 재개하지 못한 경우에는
  `recruitmentStatus`가 아예 빠지기도 한다.

**어떻게 채웠는지**
- 타입을 넓히지 않고, `project-management.adapter.ts`가 응답을 이쪽 튜플 모양으로 **깎아서**
  넘긴다. 즉 지금은 추가 필드 정보가 호출자에게 도달하지 않는다.

**왜 그렇게 채웠는지 (근거)**
- 응답 타입을 넓히는 것은 되돌리기 싼 편이지만, 이 값을 쓰는 쪽이 무엇을 기대하는지는
  담당자가 정해야 한다 — 지금 코드에서 `restoredFields`를 읽는 곳이 없어 어느 폭이 맞는지
  판단할 근거가 없다. `string[]`으로 넓히는 것이 맞아 보이나 **팀장이 임의로 바꾸지 않았다.**
- change-requests/0002에 "contracts-payments 확인 대기 중"이라 적혀 있어, 그 확인과 함께
  정하는 것이 자연스럽다.

**담당자 메모**
-

---

## 항목 3 — [충돌] `/internal/v1/projects/*` 서빙 책임을 project-management로 넘겼다

본문 위치: `feedback_loop/2026-08-28/project-management.md` 항목 1 참조

상태: 미확인

**담당자 메모**
-

---

## 항목 4 — 결제 포트·토스 어댑터를 반영했고, 아직 아무도 부르지 않는다

상태: 미확인

**Fact**
- 이번 델타에 `payment.port.ts`(`PaymentGateway`)와 `toss-payments.adapter.ts`가 새로 들어왔다.
  `app/server/AGENTS.md` "외부 벤더 연동" 표의 "결제" 칸을 채우는 산출물이다.

**어떻게 채웠는지**
- 두 파일을 `app/server/src/features/contracts-payments/`에 반영했다.
- **`app.ts`에서 어댑터를 만들지 않았다.** 결제 승인을 부르는 컨트롤러·라우트가 아직 없어서
  만들어 두면 `PG_SECRET_KEY`가 없는 환경에서 앱 조립이 예외로 끝난다.
- `hasPgSecretKey()`를 그대로 두었다 — 라우트가 생길 때 조립 지점에서 이 함수로 분기하면 된다.

**왜 그렇게 채웠는지 (근거)**
- 원본이 "키 없으면 어댑터를 만들지 않는다"로 fail-closed 설계돼 있다. 그 의도를 지키려면
  호출자가 생기기 전에 미리 연결하지 않는 것이 맞다.
- `PG_SECRET_KEY`는 서버 전용 비밀값이다 — `VITE_` 접두사를 붙이면 번들에 평문으로 박힌다
  (`app/web/AGENTS.md` "환경 변수"). 어댑터 주석에 그 경고를 남겼다.

**담당자 메모**
-

---

## 항목 5 — 웹 화면은 이번에도 만들지 않았다

상태: 미확인

**Fact**
- `features/contracts-payments/prototype/`에 여전히 `web/` 폴더가 없다. `design/`도 비어 있다.

**어떻게 채웠는지**
- `app/web/src/features/contracts-payments/`를 만들지 않았고, `App.tsx`의
  `/contracts-payments` 경로는 계속 `NotIntegratedPage`로 둔다.

**왜 그렇게 채웠는지 (근거)**
- 2026-08-27 항목 3과 같다 — 원본에 없는 화면을 지어내지 않는다.
  `review/week-wrap-2026-08-28.md`도 웹을 다음 스프린트로 잡고 있다.

**담당자 메모**
-
