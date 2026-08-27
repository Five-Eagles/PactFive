# 함수별 필수 정의 확인 — 회신

**받는 사람** 조준영 · contracts-payments
**보내는 사람** 유동우 · project-management
**날짜** 2026-08-25

| | |
|---|---|
| 대상 문서 | `yudong-function-defs-review` (2026-08-25) |
| 확인 기준 | PRD v6.4 · ERD v1.4 · `features/project-management/spec.md` |
| 결론 | **19건 중 18건 「예」 · 1건만 「아니오」** (P2) |

> 네 함수의 초안이 PRD와 어긋나는 곳이 없습니다. 확정 여부만 채워 돌려드립니다.
>
> 「아니오」는 P2 하나이고, P3에서 물어보신 것을 채택하자는 뜻입니다. 그 외에 함께 정했으면 하는 것 두 가지를 §5에 적었습니다.

---

# 1. `startProjectTransaction`

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|:---:|:---:|---|
| **S1** | 호출 주체는 조준영 서버만이고, 브라우저·의뢰인 직접 호출은 거부하는가 | **예** | | 내부 주소로 분리 (J1) |
| **S2** | start 요청에 `acceptedApplicationId`를 넣지 않고 프로젝트 컬럼만 믿는가 | **예** | | |
| **S3** | 조회 응답의 `acceptedApplicationId`가 `null`이면 start를 409로 거부하는가 | **예** | | 아래 참고 |
| **S4** | 허용 시작 상태는 `CONTRACT_PENDING`뿐이며 성공 후는 `IN_PROGRESS`인가 | **예** | | |

## S2 — 넣지 않는 이유

**같은 사실이 두 곳에 있으면 어긋났을 때 어느 쪽이 옳은지 판정할 근거가 필요해집니다.**

`accepted_application_id`는 `acceptProjectApplication`이 심는 값이고 그게 정본입니다(D-41). 요청 본문에 같은 값을 또 받으면, 둘이 다를 때 무엇을 믿을지 규칙을 하나 더 만들어야 합니다.

**대조가 필요하시면 조회 응답에서 하시면 됩니다.** `getProjectNegotiationContext`가 `acceptedApplicationId`를 내려주므로, 그 값이 조준영님 계약의 지원서와 같은지 호출 전에 확인하실 수 있습니다.

## S3 — 거부합니다. 다만 이건 데이터가 깨진 신호입니다

정상 경로에서는 `CONTRACT_PENDING`이면 `accepted_application_id`가 반드시 있습니다. `acceptProjectApplication`이 두 값을 같은 트랜잭션에서 함께 씁니다.

**따라서 `null`인데 `CONTRACT_PENDING`이면 상태 충돌이 아니라 무결성 위반입니다.**

| | |
|---|---|
| 응답 | `409 PROJECT_TRANSITION_CONFLICT` |
| 전용 코드 신설 | **하지 않습니다** — D-31이 같은 이유로 `PROJECT_ALREADY_CANCELED`를 제거했습니다 |

> **이 조건을 불변식으로 올리는 것을 제안합니다** (§6-①). 지금은 어디에도 명문화돼 있지 않아, 깨진 상태를 만들어도 아무도 잡지 못합니다.

---

# 2. `completeProjectTransaction`

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|:---:|:---:|---|
| **C1** | 납품·정산 테이블을 읽지 않고 `IN_PROGRESS`만 보고 전이하는가 | **예** | | 아래 참고 |
| **C2** | 완료는 조준영 서버만, 공개 API로는 열지 않는가 | **예** | | |
| **C3** | 이미 `COMPLETED` 재호출은 200 멱등인가 | **예** | | |
| **C4** | `CANCELED`에서 complete는 409인가 | **예** | | I-29 |

## C1 — 읽지 않습니다. 다만 검증 책임이 어디 있는지만 맞춰두겠습니다

`deliveries`·`payments`는 조준영님 테이블이고, PRD §5.1이 **"읽기는 자유, 쓰기는 계약"** 이라 읽는 것 자체는 가능합니다. 그럼에도 읽지 않는 이유는 **판정 규칙이 두 도메인에 나뉘면 반드시 어긋나기** 때문입니다.

**한 가지만 짚어두겠습니다.**

PRD가 v6.4에서 이 조건을 불변식으로 올렸습니다.

> **I-30** — `COMPLETED`는 납품 `APPROVED`와 정산 `RELEASED`가 모두 충족된 경우에만 된다

**그런데 project-management는 이 불변식을 검증할 수 없습니다.** 두 값이 전부 조준영님 도메인에 있어서입니다.

> **I-30의 테스트는 contracts-payments 쪽에 있어야 합니다.** 이쪽 `run.tsx`에서는 "`IN_PROGRESS`가 아니면 거부"까지만 확인하고, `test-report.md`에 "I-30은 호출자 검증 대상"으로 남기겠습니다.

---

# 3. `restorePreContractProject`

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|:---:|:---:|---|
| **R1** | 건드리는 필드는 거래 상태와 (조건부) 모집 상태뿐인가 | **예** | | 아래 단서 1개 |
| **R2** | restore가 합의 `REJECTED`·계약 `CANCELED`를 대신하지 않는가 | **예** | | 방향이 반대입니다 |
| **R3** | 프로젝트 취소와 restore를 같은 경로로 처리하지 않는가 | **예** | | |
| **R4** | 자동 거절된 지원자를 되살리지 않는가 | **예** | | `CONFIRMED` (PRD §5.4) |

## R1 — 두 개뿐입니다. `recruitment_start_at`은 건드리지 않습니다

**A-13 재모집과 헷갈리기 쉬운 자리라 명시해 둡니다.**

| | 건드리는 것 |
|---|---|
| `restorePreContractProject` | `transaction_status` · (조건부) `recruitment_status` |
| **A-13 재모집** | 위 두 개 + **`recruitment_start_at`을 현재 시각으로 갱신** (D-85) |

restore가 `OPEN`으로 되돌리는 경우는 **원래 마감일이 아직 남아 있을 때**입니다. 그때는 기존 모집 회차가 이어지는 것이므로 시작 시각을 바꾸지 않습니다.

`recruitment_start_at`을 새로 찍는 것은 **의뢰인이 새 마감일을 넣어 다시 모집을 여는 A-13에서만** 일어납니다.

## R2 — 방향이 반대입니다

| 함수 | 방향 | 사건 |
|---|---|---|
| `restorePreContractProject` | 조준영 → 유동우 | **협상 최종 거절** |
| `invalidateAgreementAndContract` | 유동우 → 조준영 | **프로젝트 취소** |

**두 사건은 겹치지 않습니다.** 취소 경로에서는 restore를 호출하지 않고, 최종 거절 경로에서는 invalidate를 호출하지 않습니다.

---

# 4. `markPaymentPending`

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|:---:|:---:|---|
| **P1** | 허용 조건은 `CONTRACT_PENDING` + 미취소뿐인가 | **예** | | |
| **P2** | 본문에 결제·계약 ID 없이 멱등 키만으로 충분한가 | | **아니오** | P3 채택 제안 |
| **P3** | 본문에 `contractId` 명시 필드가 필요한가 | **예** | | **초안과 다름** |
| **P4** | 이미 `paymentPendingAt`이면 200, 시각은 최초값 유지인가 | **예** | | |

## P2 · P3 — `contractId`를 본문에 넣는 편이 낫겠습니다

초안은 "멱등 키 `payment-pending-{contractId}`에 이미 들어 있으니 불필요"인데, **세 가지 이유로 명시 필드를 권합니다.**

**첫째, 멱등 키에서 문자열을 잘라 쓰는 구조가 됩니다.** 키 형식이 한 번이라도 바뀌면 파싱하는 쪽이 조용히 깨집니다. 멱등 키는 **같은 요청인지 판별하는 용도**이지 값을 담아 전달하는 통로가 아닙니다.

**둘째, 나중에 추적할 수 없습니다.** `payment_pending_at`이 왜 찍혔는지 물으면 본문만으로는 답할 수 없고 멱등 키를 역산해야 합니다.

**셋째, 사용자 안내에 쓰입니다.** 이 값이 찍힌 뒤 취소 요청이 오면 `409`로 거부하는데(D-40), 그때 "어느 결제 때문인지"를 알려면 계약을 알아야 합니다.

```json
{
  "contractId": "ctr_123",
  "requestId": "req_pending_01",
  "idempotencyKey": "payment-pending-ctr_123",
  "occurredAt": "2026-08-25T05:00:00Z"
}
```

**비용은 필드 하나입니다.** 멱등 키를 만드시려면 `contractId`가 이미 손에 있습니다.

## P4 — 최초 시각을 유지합니다

재호출로 시각이 갱신되면 **취소 차단 경계가 뒤로 밀립니다.** 결제를 처음 시작한 시점이 기준이어야 하므로 최초값을 그대로 둡니다 (§5.7 멱등 원칙).

---

# 5. 함께 정할 3건 — 재확인

| # | 내용 | 예 | 아니오 | 메모 |
|---|---|:---:|:---:|---|
| **J1** | 경로 `/internal/v1/projects/:projectId/...` | **예** | | |
| **J2** | `notReopenedReason`: `null` / `DEADLINE_PASSED` / `PENDING_APPLICATIONS_REMAIN` | **예** | | |
| **J3** | start와 complete만 `expectedProjectVersion` 필수 | **예** | | 나머지는 선택 |

세 건 모두 `spec.md`에 규칙 49·50·51로 넣었습니다. 확정 상태로 구현합니다.

---

# 6. 추가로 정했으면 하는 것 2건

## ① `CONTRACT_PENDING`이면 수락 지원서가 반드시 있다 — 불변식 신설 제안

S3에서 나온 항목입니다. 지금은 이 조건이 어디에도 적혀 있지 않아, **깨진 데이터가 들어가도 아무도 잡지 못합니다.**

```text
transaction_status = CONTRACT_PENDING   ⇒   accepted_application_id 가 있다
```

| | |
|---|---|
| 강제 주체 | 애플리케이션 (`acceptProjectApplication`이 두 값을 함께 씀) |
| 검증 | project-management `run.tsx` |
| 효과 | S3의 `409`가 임시 방어가 아니라 명문화된 규칙이 됨 |

**PRD 다음 개정에서 불변식으로 추가하겠습니다.** 이견 있으시면 알려주세요.

## ② I-30 테스트를 어느 쪽에서 할지

C1에서 나온 항목입니다. **`COMPLETED`는 납품 `APPROVED`와 정산 `RELEASED`가 모두 충족돼야 한다(I-30)** 를 project-management가 검증할 수 없습니다.

| 검증 위치 | 확인 내용 |
|---|---|
| project-management | `IN_PROGRESS`가 아니면 거부 |
| **contracts-payments** | **두 조건이 충족되기 전에는 호출하지 않는다** |

이쪽 `test-report.md`에는 **"I-30은 호출자 검증 대상"** 으로 남기겠습니다. 그쪽 테스트에 한 줄 넣어주시면 규칙이 실제로 지켜지는지 확인됩니다.

---

# 한 장 요약

```text
■ 19건 중 18건 「예」

  S1~S4   startProjectTransaction        전부 예
  C1~C4   completeProjectTransaction     전부 예
  R1~R4   restorePreContractProject      전부 예
  P1·P4   markPaymentPending             예
  J1~J3   함께 정할 3건                   전부 예 · spec.md 규칙 49~51


■ 유일한 「아니오」

  P2  멱등 키만으로 충분한가        →  아니오
  P3  contractId 명시 필드 필요     →  예 (초안과 다름)

      멱등 키에서 문자열을 잘라 쓰는 구조가 되고, 나중에 추적이 안 됩니다.
      필드 하나이고, 멱등 키를 만드시려면 이미 손에 있는 값입니다.


■ 헷갈리기 쉬운 자리 하나

  restore 는 recruitment_start_at 을 건드리지 않습니다.
  그 값을 새로 찍는 것은 A-13 재모집뿐입니다 (D-85).


■ 추가 제안 2건

  ① CONTRACT_PENDING ⇒ accepted_application_id 존재  — 불변식 신설
  ② I-30 테스트는 contracts-payments 쪽에서           — 이쪽은 검증 불가
```
