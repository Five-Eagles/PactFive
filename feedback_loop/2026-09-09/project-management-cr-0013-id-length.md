# project-management CR-0013 — 생성 id가 varchar(30)을 넘는 문제 반영 (2026-09-09)

## 한 일

**스키마 폭 확장** — `express-app.ts`의 `randomId()`(접두어+UUID32)와
`contractsPaymentsRandomId(prefix)`, 각 `prisma-*.repository.ts`에 흩어진 개별
`randomUUID()` 호출을 전수 조사했다. 접두어 3~6자 + UUID32 조합이 만드는 실제 id 길이는
35~38자인데 스키마는 `varchar(30)`이었다 — 가장 긴 값은 `ApplicationOperation.id`의
`appop_` + 32자 = **38자**. `schema.prisma`의 해당 컬럼(PK) 및 그 id를 받는 모든 FK 컬럼을
**`varchar(40)`**으로 넓혔다(여유분 포함, 30개 테이블 · 70개 컬럼).

**합성/외부 문자열 컬럼은 별도 폭** — `application_closures.closure_event_id`
(`close-${projectId}-${at}` 형태로 project-management가 직접 조립)와
`invalidations.cancellation_id`(클라이언트가 그대로 넘기는 값)는 길이를 예측할 수 없어,
이 스키마의 다른 이벤트/멱등 키 컬럼(`application_idempotency_keys.key` 등)과 같은
**`varchar(160)`**으로 넓혔다.

**건드리지 않은 것** — enum 성격 컬럼 6개(`ApplicationOperationStep.name`,
`Payment.feePolicyVersion`/`paymentMethod`, `NegotiationOffer.rejectedReason`,
`PricingApplicationReceipt.operation`, `Notification.resourceType`)는 고정 문자열
목록이라 30자 그대로 뒀다. `auth_sessions.revoked_reason`은 ERD 문서엔 아직
`varchar(30)`으로 남아 있지만 `schema.prisma`에서는 이미 `SessionRevokedReason` enum으로
승격돼 있어(스키마 자체는 문제없음) ERD 쪽 표기만 참고용이라고 주석을 달았다.

## 파일

- `app/server/prisma/schema.prisma` (70컬럼, VarChar(30)→(40) 68건·(160) 2건)
- `app/server/prisma/migrations/20260909150000_widen_generated_id_columns_cr_0013/`
- `docs/domain/reference/erd-v1.4.dbml` (동일 70건)
- `docs/domain/erd.md` (동일 70건 — `##`/`####`/`#####` 세 단계 헤딩에 흩어져 있어 표
  헤더 자동 인식 스크립트로 1차 반영 후, `users`/`auth_sessions`(`##` 레벨)와
  `application_operations` 내부 부기 테이블 4종(`#####` 레벨) 12곳은 수동으로 보완)
- `app/server/src/features/reviews/prisma-review.repository.ts` (주석의 "varchar(30)"
  표기 정정)
- `features/project-management/change-requests/0013-generated-ids-exceed-varchar-30.md`
  (닫음)

## 검증

- `npx tsc --noEmit`(app/server, 실제 생성된 Prisma client 기준): **0 errors.** 컬럼 폭은
  Prisma Client의 TS 타입 표면에 나타나지 않아(둘 다 `string`) 이 변경만으로는 타입
  영향이 없다 — 예상대로다.
- `npx tsx --test tests/deadline-sweep.test.ts`: 7/7 PASS.
- `npx tsx --test tests/project-pricing-registration.test.ts`: 8/8 PASS.
- `schema.prisma` 중괄호/괄호 균형 수동 확인(중괄호 53:53, 괄호 787:787, 모델 32개) —
  스크립트 치환 후 구조 손상 없음 확인.
- `npx prisma validate`·`npx prisma format`은 이 샌드박스에서 schema-engine 바이너리를
  네트워크로 못 받아 타임아웃(#176·#202·#207과 동일한 환경 제약, 새로운 문제 아님).
  로컬에서 `npx prisma generate` 재실행 시 함께 확인 필요.

## 담당자별 영향/리스크

**유동우 (project-management, CR-0013 제기자)** — 코드 변경 없음. `Project.id` 등
project-management 소유 컬럼이 30→40자로 넓어졌다는 사실만 인지하면 된다. 제안했던
"컬럼 늘리기"를 그대로 채택했다.

**전체 팀** — 이 변경 자체는 코드 쪽 타입에 영향이 없어 별도 마이그레이션 없이도
`app/server` 빌드는 그대로 통과한다. 다만 **배포 DB에 실제로 `ALTER TABLE`을 적용해야
효과가 있다** — 로컬 `npx prisma generate` 재실행은 이번에도 필요 없다(스키마 구조가
아니라 컬럼 폭만 바뀜).

**배포 전 확인 필요 (팀장, 미해결)** — 이 마이그레이션은 스테이징/운영 Postgres에
아직 적용해보지 않았다. `ALTER COLUMN ... TYPE VARCHAR(n)`으로 넓히기만 하므로
기존 행 손상 위험은 낮지만(PostgreSQL 문서 기준 안전한 방향 변경), 배포 전 스테이징에서
프로젝트 등록 1건이 실제로 성공하는지 스모크 테스트로 재현 확인이 필요하다. 이번 변경
범위 밖에서 발견한 별도 항목 — `express-app.ts`의 `randomId()`류 생성 규칙 자체는 여전히
"접두어 + UUID32" 패턴이라, 스키마를 40자로 넓혀도 접두어가 더 길어지는 신규 엔티티가
추가되면 다시 넘칠 수 있다. 근본 해결(ULID30 채택)은 user-management CR-0002가 이미
언급한 후속 과제로 남는다.

## 다음

배포 전 D-2 액션 아이템(팀 회의 자료 `deploy-review-2026-09-09.html` §11) 중 "CR-0013
스키마·마이그레이션 작성"이 이 커밋으로 완료. 남은 것은 실제 스테이징 DB에 적용 후
스모크 테스트뿐이다.
