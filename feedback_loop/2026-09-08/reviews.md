# reviews 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): PR #79 (조준영, 상호 리뷰 Mock·REV-01)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — reviews 내부 부기 구조를 ERD/schema.prisma에 신설 반영 (E-39·E-40)

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `review.service.ts`의 `reviewCreatedPublishedAt`(REVIEW_CREATED 이벤트 중복 발행 방지)과
  `getIdempotency`/`setIdempotency`(리뷰 작성 멱등 캐시)는 원본 프로토타입 코드에는 있었지만
  ERD·`schema.prisma`엔 반영된 적이 없었다. 6개 기능을 InMemory에서 Prisma로 옮기는 작업을
  준비하며 발견했다.

**어떻게 채웠는지**
- ERD: `docs/domain/reference/erd-v1.4.dbml`의 `reviews` 테이블에 `review_created_published_at`
  컬럼 추가, `review_idempotency_keys` 테이블 신설(E-39·E-40). `docs/domain/erd.md`에도 동일 반영.
- 스키마: `app/server/prisma/schema.prisma`의 `Review` 모델에 `reviewCreatedPublishedAt` 컬럼
  추가, `ReviewIdempotencyKey` 모델 신설(PRISMA-GAP-9·10).

**왜 그렇게 채웠는지 (근거)**
- 100% 원본 그대로다 — `features/reviews/prototype/server/review.service.ts`(조준영)에 이미
  구현·검증돼 있던 구조를 뒤늦게 정본 문서에 반영하는 것뿐이고, 팀장의 새 설계 판단은 없었다.

**담당자 메모**
- {검토 후 자유 기재}

---
