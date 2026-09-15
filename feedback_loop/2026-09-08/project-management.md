# project-management 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): "계약 함수 7종 구현" (유동우)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — project-contract 멱등 기록을 ERD/schema.prisma에 신설 반영 (E-46)

상태: 반영완료

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

**맞습니다. 네 필드가 제 구조와 정확히 일치합니다.**

`ProcessedRecord`(prototype/mock/project.mock.ts 38~43행)가 갖고 있던
`idempotencyKey` · `processedAt` · `result` · `projectVersion` 그대로입니다.
새 설계가 들어간 게 없다는 말씀도 맞습니다.

`idempotency_key` varchar(100) 도 충분합니다. 실제로 재봤습니다 — 제가 만드는 키 중
가장 긴 것이 취소 키(`project-cancel-cxl-{projectId}-{ISO시각}`)로 **80자**입니다.
나머지는 44~51자입니다.

---

**다만 그 확인 중에 별개 결함을 찾았습니다. 이건 배포를 막습니다.**

**서버가 만드는 id 가 스키마 제한을 6자 넘습니다.**

| 만드는 값 | 길이 | 스키마 | |
|---|---|---|---|
| `prj_` + UUID32 | 36자 | `Project.id` varchar(30) | **초과** |
| `bkm_` + UUID32 | 36자 | `Bookmark.id` varchar(30) | **초과** |
| `pra_` + UUID32 | 36자 | `PricingAnalysis.id` varchar(30) | **초과** |

`express-app.ts:196` 의 `randomId()` 가 UUID 에서 하이픈만 뺀 32자를 주고,
접두어 4자가 붙어 36자가 됩니다.

**지금은 안 터집니다** — 인메모리 저장소를 쓰고 있어서 길이 검사가 없습니다.
`DATABASE_URL` 을 붙이는 순간 **프로젝트 등록·북마크·AI 분석이 전부 실패합니다.**
발표 시연 동선의 첫 단계입니다.

**notifications CR-0001 §5 와 같은 문제입니다.** 거기서는 `usr_` + UUID32 = 36자가
`User.id` varchar(30) 를 넘는다고 지적했는데, **제 쪽 세 개도 똑같은 상태인데
아무도 안 짚었습니다.**

**해결은 두 방향입니다.**

1. **컬럼을 늘린다** — varchar(30) → varchar(36). 스키마만 고치면 되고 코드는 그대로입니다.
2. **id 를 줄인다** — 접두어 포함 30자에 맞춘다. 코드를 고쳐야 하고 이미 만들어진
   데이터가 있으면 손봐야 합니다.

**1번을 권합니다.** CR-0001 §5 가 "생성 규칙·기존 데이터·스키마 정책을 팀장이
맞춰야 한다"고 남겨둔 그 결정에 제 세 개도 같이 넣어 주시면 됩니다.
어느 쪽이든 `docs/domain/` 과 `schema.prisma` 는 팀장 영역이라 요청으로 남깁니다.

---
