# CR-0002 — `restorePreContractProject`가 비우는 필드 2개 추가

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-08-26 |
| 확인 필요 | 조준영 (contracts-payments) |
| 상태 | 제안 — 구현에는 이미 반영, 회신 후 확정 |
| 관련 | spec.md 규칙 39·47 · api-contract.md `restore-pre-contract` |

## 요약

복원 응답의 `restoredFields` 예시에는 `recruitmentStatus` · `transactionStatus` 두 개만
적혀 있다. 여기에 **`acceptedApplicationId`와 `paymentPendingAt`을 함께 비우는 것**을
제안한다.

## 왜

두 값을 남겨두면 프로젝트가 **조용히 막힌다.** 오류가 나지 않아서 알아채기도 어렵다.

### 1. `acceptedApplicationId`

규칙 47은 "한 프로젝트에서 수락된 지원은 최대 1건"이다. 복원으로 모집이 `OPEN`이 됐는데
이전 수락 기록이 남아 있으면, 새 지원자를 수락하려 할 때 규칙 47에 걸린다.

```text
협상 결렬 → 복원 → 모집 OPEN → 새 지원자 수락 시도 → 409
```

**모집은 열려 있는데 아무도 수락할 수 없는 상태**가 된다. 의뢰인 화면에는 모집 중으로
보이고, 지원자도 지원할 수 있다. 문제는 수락 버튼을 누르는 순간에야 드러난다.

### 2. `paymentPendingAt`

규칙 27은 "`payment_pending_at`이 채워져 있으면 취소할 수 없다"이다. 결제를 시작한 뒤
협상이 결렬돼 복원되면, 거래는 `NONE`으로 돌아가지만 결제 시작 시각은 남는다.

```text
결제 시작 → 협상 결렬 → 복원 → 거래 NONE → 취소 시도 → 409
```

**거래가 없는데 취소도 안 되는 상태**가 된다. 되돌릴 방법이 없다.

## 제안

복원 시 두 값을 `null`로 되돌리고, 실제로 비운 필드만 `restoredFields`에 담는다.

```json
{
  "restoredFields": ["recruitmentStatus", "transactionStatus", "acceptedApplicationId"]
}
```

`paymentPendingAt`은 값이 있었을 때만 목록에 넣는다.

## 확인이 필요한 지점

`restoredFields`를 화면 안내나 로그에 쓰고 계시면 **항목이 늘어난다.** 개수를 고정으로
보고 계신 곳이 있으면 알려주십시오.

`acceptedApplicationId`를 비우는 것이 applications 쪽 데이터와 어긋나는지도 확인이
필요하다. 규칙 39의 "자동 거절된 지원자를 되살리지 않는다"는 그대로 지킨다 —
프로젝트 쪽 수락 표시만 지우는 것이고, 지원서 상태는 건드리지 않는다.

## 현재 구현

`prototype/server/project-contract.service.ts`에 위 제안대로 반영했고,
`prototype/run.tsx`에 검사 2건을 넣었다.

- 복원 후 `acceptedApplicationId`가 비는지
- 복원된 프로젝트가 **새 지원자를 다시 수락할 수 있는지**

회신 내용이 다르면 그 함수 한 곳만 고치면 된다.
