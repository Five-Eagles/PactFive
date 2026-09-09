# reviews 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): PR #79 (조준영, 상호 리뷰 Mock·REV-01)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — reviews 내부 부기 구조를 ERD/schema.prisma에 신설 반영 (E-39·E-40)

상태: 반영완료

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
- 조준영 2026-09-09 — 둘 다 원본과 맞습니다. `review_created_published_at`은
  `review.service.ts`의 `publishNewlyPublic`이 「이미 보낸 행은 건너뛰어 공개 시점 1회만
  지킨다」로 쓰는 값이고, NULL을 미발행으로 보는 것도 원본과 같습니다. nullable로 둔 것이
  정확합니다 — 리뷰는 작성 시점이 아니라 **공개 시점**에 발행되므로 생성 직후에는 값이 없어야
  합니다.
- `review_idempotency_keys`도 원본 `getIdempotency`/`setIdempotency`의
  `{ bodyHash, reviewId }` 그대로입니다(`review.types.ts:202~203`).
- 한 가지만 봐 주세요 — **`isPublic`이 계산값이라는 주석이 `tags` 위에 붙어 있습니다.**
  맞는 설명이지만 위치가 `tags` 컬럼 주석과 붙어서, 태그 검증 규칙과 공개 여부 규칙이 한
  덩어리로 읽힙니다. 공개 여부는 「상호 작성 완료 또는 14일 창 경과」(reviews spec 규칙 4)라
  성격이 다릅니다. 다음에 스키마 손보실 때 문단만 나눠 주시면 좋겠습니다.
- 멱등 키 길이 `varchar(160)`은 applications와 같습니다. `CR-CP-002`에서 제가 120으로 제안한
  것과 어긋나므로, 팀장님이 한쪽으로 정해 주시면 그 값으로 맞추겠습니다.

**태그 한글 라벨 회신 (E-38 / CR-RV-001 관련) — 조준영 2026-09-09**

- `docs/domain/erd.md:638~640`에 「`features/reviews/`의 spec·api-contract·prototype 어디에도
  한글 라벨이 없어 코드만 반영했다」는 가정이 있는데, **라벨 10종은 있습니다** —
  `features/reviews/prototype/web/review.view-model.ts:61~75`입니다. 화면에만 쓰는 문구라
  `server/`가 아니라 `web/` 아래에 두었습니다. 찾으신 곳이 `server/`였던 것 같습니다.
- 전문은 `features/reviews/review/teamlead-port-instructions-2026-09-09.md` §1-2 표에
  방향별로 정리해 두었습니다. `app/web`의 `TAG_LABEL`(`ReviewPage.tsx:28~38`)이 아직 구 E-19
  라벨이라 그 표로 교체하시면 됩니다.
- **한 가지 주의점**이 있습니다. `GOOD_COMMUNICATION`은 양방향 라벨이 같지만
  `PROFESSIONAL_ATTITUDE`는 **다릅니다** — 의뢰인→프리랜서는 「업무 태도가 전문적이에요」,
  프리랜서→의뢰인은 「협업 태도가 전문적이에요」입니다. 지금 `app/web`처럼 코드 하나에 라벨
  하나를 매핑하는 `Record<string, string>` 구조로는 이 구분이 안 됩니다. 방향별로 골라야
  합니다.
- 그래서 라벨을 서버가 내려주는 방식으로 바꾸실 생각이면 알려주세요 — 계약에 필드가 늘어나므로
  `api-contract.md`를 제가 고쳐야 합니다 (지시서 확인 질문 R4).

---
