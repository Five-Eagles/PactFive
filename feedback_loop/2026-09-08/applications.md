# applications 피드백 — 2026-09-08 통합

반영 커밋(develop 기준): 6202e16 (`feat(applications): 지원 Mock에 eligibility·202/outbox와
건수 분담을 넣는다 (#83)`)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — applications outbox/operation 부기 구조를 ERD/schema.prisma에 신설 반영 (E-41~E-45)

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- 수락/거절 후속 처리 outbox(`ApplicationOperation`·`OperationStep`), 상태 전이 이력
  (`ApplicationStateEvent`), 멱등 캐시·모집마감 일괄거절 멱등 결과(`IdempotencyRecord`·
  `RejectPendingApplicationsResult`)는 PR #83에 이미 구현돼 있었지만 ERD·`schema.prisma`엔
  반영된 적이 없었다.
- 확인 과정에서 알아둘 사실: 현재 작업 브랜치(`feature/contracts-payments-increment2-integration`)
  의 `features/applications/prototype/` 스냅샷은 PR #83 머지 이전 상태라 이 구조가 안 보인다.
  `git show 6202e16`으로 develop의 실제 커밋을 열어 확인했다 — `app/server/src/features/
  applications/`(이식본)에는 이미 이 구조가 정상 반영돼 있다.

**어떻게 채웠는지**
- ERD: `docs/domain/reference/erd-v1.4.dbml`에 `application_operations`·
  `application_operation_steps`·`application_state_events`·`application_idempotency_keys`·
  `application_closures` 5개 테이블 신설(E-41~E-45). `docs/domain/erd.md`에도 동일 반영.
- 스키마: `app/server/prisma/schema.prisma`에 동명의 Prisma 모델 5개 신설
  (PRISMA-GAP-11~15).

**왜 그렇게 채웠는지 (근거)**
- 원본(PR #83) 그대로다. `OperationStep`을 배열이 아니라 자식 테이블(`ApplicationOperationStep`)
  로 정규화한 것만 팀장이 구조를 바꾼 부분이고, type·status를 Prisma enum이 아니라 varchar로 둔
  것도 원본 코드의 리터럴 유니온을 그대로 옮긴 것이다(팀장이 임의로 enum화하지 않음).

**담당자 메모**
- 조준영 2026-09-09 — 5개 테이블 전부 `prototype/server/application.types.ts`와 필드 단위로
  대조했습니다. **원본과 맞습니다.** `ApplicationOperation`은 `operationId`~`attempts`까지
  10개 필드가 그대로 있고, `type`·`status`를 enum이 아니라 varchar로 둔 판단에 동의합니다 —
  단계 이름이 늘어날 때 마이그레이션 없이 갈 수 있습니다.
- `steps` 배열을 자식 테이블로 정규화한 것도 좋습니다. **`seq` 컬럼 추가는 필요한 판단이었습니다** —
  원본 `steps: OperationStep[]`는 순서가 의미를 가집니다(`REJECT_OTHERS` → `CREATE_NOTIFICATIONS`
  → `ENSURE_NEGOTIATION_CONTEXT`). 배열을 풀면 순서가 사라지므로 `@@unique([operationId, seq])`가
  맞습니다.
- `ApplicationStateEvent`의 `at` → `occurred_at` 개명과 `id` 신설도 동의합니다. 원본은
  append-only 배열이라 PK가 없었습니다.

**두 곳만 원본 의미와 어긋납니다 — 다음 스키마 손볼 때 함께 부탁드립니다**

1. **`ApplicationClosure.result`가 `Json`입니다.** 원본은 `PostActionResult =
   "DONE" | "NOT_NEEDED" | "FAILED"` 3값 리터럴입니다(`application.types.ts:18`).
   `varchar(20)`이어야 팀장님이 위에 쓰신 원칙("리터럴 유니온은 varchar로")과도 맞습니다.
   `Json`이면 DB가 값을 못 걸러내고, 재조회에서 문자열 비교가 어색해집니다.
2. **`ApplicationOperationStep`에 `(operationId, name)` 유니크가 없습니다.** 원본은
   `saveOperation`이 `steps` 배열을 **통째로 덮어쓰므로**(`application.mock.ts:223·226`) 같은
   단계가 두 번 생기는 것이 구조적으로 불가능했습니다. 자식 테이블로 풀면 append가 가능해져,
   outbox 재실행 때 같은 단계가 중복 삽입될 수 있습니다. `seq` 유니크만으로는 안 막힙니다.

**참고 (막는 것은 아닙니다)**

- `application_closures`에 `project_id`·`reason`·`occurred_at`이 없습니다. 멱등 재조회는
  `closure_event_id`만으로 되니 지금은 충분하지만, 규칙 8이 마감(`AUTO_RECRUITMENT_CLOSED`)과
  취소(`rejectionType=null`, GAP-01)를 사유로 갈라놓는데 그 사유가 남지 않습니다. 원본
  스토어도 결과만 저장하므로 **이건 제 설계에서 온 것**입니다 — 나중에 정리하겠습니다.
- 멱등 키 길이가 `varchar(160)`인데 제가 어제 올린 `CR-CP-002`에서는 120으로 제안했습니다.
  기능마다 다를 이유가 없으니 팀장님이 한쪽으로 맞춰 주시면 그 값을 따르겠습니다.

---
