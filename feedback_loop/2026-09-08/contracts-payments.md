# contracts-payments 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): #80 (조준영, `public-api.mock.ts`)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — deliveries 컬럼 7종 + invalidations 테이블 신설 (E-47·E-48) — 확인 요청

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `deliveries`에 `version`·`object_key`·`file_name`·`mime_type`·`size_bytes` 5개 컬럼을
  추가했다. 이 5개는 원본(`features/contracts-payments/prototype/mock/public-api.mock.ts`의
  `DeliveryRow`)에 이미 있던 값을 그대로 옮긴 것이다.
- `invalidations` 테이블을 신설했다. 취소 시 계약 무효화 결과(`contractInvalidation`) 개념
  자체는 원본 mock에 있었다.

**어떻게 채웠는지**
- ERD: `docs/domain/reference/erd-v1.4.dbml`의 `deliveries` 테이블에 컬럼 7종 추가,
  `invalidations` 테이블 신설(E-47·E-48). `docs/domain/erd.md`에도 동일 반영.
- 스키마: `app/server/prisma/schema.prisma`의 `Delivery` 모델에 컬럼 7종 추가, `Invalidation`
  모델 신설(PRISMA-GAP-17).

**왜 그렇게 채웠는지 (근거) — 확인 필요한 부분**
- **팀장이 원본 없이 추가한 부분**: `deliveries.file_sha256`(업로드 파일 무결성 해시)과
  `deliveries.requested_by`(납품 요청자) 2개 컬럼은 원본 mock에 없던 필드다. spec.md 규칙
  23(파일 무결성 관련)을 근거로 팀장이 추가했다.
- **팀장이 구조를 새로 설계한 부분**: `invalidations`를 "별도 영속 테이블"로 만든 것 자체가
  팀장 판단이다. 원본엔 결과값 개념만 있었지, 테이블로 분리해 이력을 남기는 설계는 없었다.
  spec.md 규칙 25(취소 시 GET으로 마지막 무효화 결과 조회)를 근거로 삼았다.
- 위 두 가지는 다른 3개 기능(reviews·applications·project-management)의 이번 반영분과 달리
  "원본 그대로"가 아니라 팀장의 해석이 섞여 있다. 사용자(팀장 본인)가 이미 "그대로 진행 +
  담당자에 사후 공유"로 승인해 반영은 완료했지만, 실제 설계자인 조준영님이 보기에 필드명·
  범위가 이상하면 언제든 바꿀 수 있다 — 이미 배포된 마이그레이션이 아니라 아직 로컬에서
  `prisma migrate dev`도 실행 전인 초안 단계다.

**담당자 메모**
- {검토 후 자유 기재}

---
