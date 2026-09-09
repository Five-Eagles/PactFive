# project-management 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): "계약 함수 7종 구현" (유동우)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — project-contract 멱등 기록을 ERD/schema.prisma에 신설 반영 (E-46)

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `project-contract.service.ts`의 `findProcessed`/`markProcessed`(계약 함수 호출의 멱등 처리
  기록)는 원본 프로토타입 코드에는 있었지만 ERD·`schema.prisma`엔 반영된 적이 없었다.

**어떻게 채웠는지**
- ERD: `docs/domain/reference/erd-v1.4.dbml`에 `project_contract_idempotency_records` 테이블
  신설(E-46). `docs/domain/erd.md`에도 동일 반영.
- 스키마: `app/server/prisma/schema.prisma`에 `ProjectContractIdempotencyRecord` 모델 신설
  (PRISMA-GAP-16).

**왜 그렇게 채웠는지 (근거)**
- 100% 원본 그대로다 — `features/project-management/prototype/server/
  project-contract.service.ts`(유동우)에 이미 구현돼 있던 구조를 뒤늦게 정본 문서에 반영하는
  것뿐이고, 팀장의 새 설계 판단은 없었다.

**담당자 메모**
- {검토 후 자유 기재}

---
