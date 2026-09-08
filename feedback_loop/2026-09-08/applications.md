# applications 피드백 — 2026-09-08 통합

반영 커밋(develop 기준): 6202e16 (`feat(applications): 지원 Mock에 eligibility·202/outbox와
건수 분담을 넣는다 (#83)`)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — applications outbox/operation 부기 구조를 ERD/schema.prisma에 신설 반영 (E-41~E-45)

상태: 미확인

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
- {검토 후 자유 기재}

---
