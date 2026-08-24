# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-08-24
테스트한 커밋: 38e8e85 (이 기능 작업 시작 시점 기준 — 아직 커밋 전 작업물)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 34, FAIL 개수: 0)

## spec.md 규칙별 확인

`spec.md`에는 규칙이 14개 있다. 전부 `run.tsx`의 in-memory Mock(`mock/contract.mock.ts`) 테스트로
확인했다.

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 (합의 제안, 활성 합의 1건 제한) | `run.tsx` "규칙1: 합의 제안 성공" / "같은 지원서에 활성 합의가 있으면 409" | 통과 |
| 2 (합의 수락 → 계약 DRAFT 자동 생성, 제안자 본인 수락 불가) | `run.tsx` "규칙2: 합의 수락 시 계약 DRAFT 자동 생성" / "제안한 본인은 수락 불가 → 403" | 통과 |
| 3 (합의 거절 → restorePreContractProject 호출) | `run.tsx` "규칙3: 합의 거절 시 status=REJECTED" / "거절 시 restorePreContractProject 호출됨" (callLog 검증) | 통과 |
| 4 (계약 서명, 양측 서명 시 SIGNED, 중복 서명 거부) | `run.tsx` "규칙4" 3개 테스트 (SIGNING → SIGNED → 재서명 409) | 통과 |
| 5 (SIGNED가 아니면 결제 불가) | `run.tsx` "규칙5: DRAFT 계약은 결제 불가 → 409" | 통과 |
| 6 (PG 요청 직전 markPaymentPending 호출) | `run.tsx` "규칙6" 2개 테스트 (호출 여부 + 호출 순서, callLog 검증) | 통과 |
| 7 (수수료 계산, 1원 미만 버림) | `run.tsx` "규칙7" — agreedAmount 1,000,001원으로 일부러 나머지가 남는 금액을 써서 floor 확인 | 통과 |
| 8 (PG 승인/거절에 따른 PAID/FAILED) | `run.tsx` "규칙8" 승인 케이스 + 거절 케이스 2개 | 통과 |
| 9 (SIGNED+PAID 둘 다일 때만 startProjectTransaction 1회, 취소된 프로젝트면 409) | `run.tsx` "규칙9" 성공 케이스(callLog) + 취소된 프로젝트 케이스(409) | 통과 |
| 10 (취소 시 계약 CANCELED·합의 REJECTED, 서명 기록 보존) | `run.tsx` "규칙10" — 서명 1건 있는 상태에서 취소 처리 후 clientSignedAt이 그대로 남아있는지 확인 | 통과 |
| 11 (SIGNED가 아니면 납품 요청 불가) | `run.tsx` "규칙11" 서명 전 409 + 서명 후 성공 | 통과 |
| 12 (납품 승인 시 payment RELEASED) | `run.tsx` "규칙12: 납품 승인 시 delivery=APPROVED, payment=RELEASED" | 통과 |
| 13 (APPROVED+RELEASED 둘 다일 때 completeProjectTransaction 1회) | `run.tsx` "규칙13" (callLog 검증) | 통과 |
| 14 (PG 벤더 의존을 포트 뒤에 격리) | `run.tsx` "규칙14" 2개 — `contract.service.ts` 소스에 어댑터 직접 import가 없는지 정적 검사 + `TossPaymentsAdapter`가 `confirmPayment`를 구현하는지 확인 | 통과 |

UI 필수 요소 목록(design/low-fi.html)도 `run.tsx`가 `ContractDetail` 컴포넌트를
`renderToStaticMarkup`으로 렌더링해 10개 항목("계약 상세" / "합의 금액" / "계약 서명하기" /
"결제 금액" / "플랫폼 수수료" / "정산 예정액" / "결제하기" / "납품 상태" / "납품 요청" /
"납품 승인") 전부 포함되는지 확인했다 — 통과.

## 아직 안 되는 것 (Known Issues)

- `prototype/server/`(controller/service/repository)는 구현 초안 코드일 뿐 실제 DB·PG에 연결돼
  있지 않다 (의도된 상태 — ADR-0006). `contract.repository.ts`, `toss-payments.adapter.ts`,
  `project-transaction.client.ts`는 호출하면 "not implemented" 에러를 던진다. 규칙 검증은
  `mock/contract.mock.ts`(in-memory)로 했다.
- `project-transaction.client.ts`가 부르는 project-management 도메인 함수(C-02·C-03·C-04·C-07)는
  유동우 담당 기능이 아직 실제로 존재하지 않아, 실제 HTTP 연동은 팀장 통합 단계 또는 두 담당자가
  함께 붙이는 단계에서 검증이 필요하다.
- 서명·결제 화면(`ContractDetail.tsx`)은 하나의 화면에 계약·결제·납품을 모두 모아둔 대시보드
  형태다. 실제 화면 흐름(계약 상세 → 결제 → 납품)을 여러 페이지로 나눌지는 high-fi 디자인
  단계에서 다시 정할 수 있다.
- `agreements` 제안 화면(POST /agreements를 부르는 UI)은 이번 프로토타입에 없다. low-fi
  와이어프레임과 `ContractDetail`은 "합의가 이미 수락된 이후" 시점부터 다룬다 — 제안 자체는
  최윤석 담당 `applications` 상세 화면에서 진입점이 시작될 가능성이 높아 보이나 확인이 필요하다.

## 팀장에게 물어봐야 하는 것

- `change-requests/2026-08-24-agreement-negotiation-scope.md` — PRD §5.4의 `restorePreContractProject`
  2차(재협상) 시그니처와 ERD·naming-convention의 1차(단순) 모델이 충돌한다. 이 기능은 1차 모델로
  진행했다. 팀 결정 필요.
- 합의 제안(POST /agreements) 진입 화면이 어느 기능(applications vs contracts-payments) 소관인지
  확인 필요.
