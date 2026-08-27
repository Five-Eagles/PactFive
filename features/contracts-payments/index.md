# contracts-payments Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/contracts-payments/)
- spec.md: 합의·서명·샌드박스 결제 설계 확정 + 4함수·PG 포트 FACT.
  정본 고정은 `review/spec-design-eval.md`. 규칙 19~22는 전이표·필드·FAILED·백로그.
- api-contract.md: 내부 4함수 + 공개 API 초안 (`negotiation-offers`, `signContract`, 결제).
  프론트 `/agreements` 5종은 폐기.
- review/: 교차 담당 확인 요청·회신.
  Mock import 안내는 `review/mock-stub-import-guide.md` (유동우·최윤석 공유).
  팀장 sandbox 키 요청은 `review/teamlead-pg-sandbox-keys.md`.
  8/27 설계서 평가·최적안은 `review/spec-design-eval.md`.
  금주 마감은 `review/week-wrap-2026-08-28.md`.
- prototype/: 유동우 포트 스탠드인 Mock + 조준영 호출 서비스 + `PaymentGateway` Mock.
  다른 기능은 `prototype/index.ts`만 import한다.
  `npx tsx prototype/run.tsx`로 spec 규칙 1~9와 19·21 Mock을 확인한다.

### Mock 시드 (성공·실패 재현)

`createProjectTransactionMock()`마다 새 저장소. 토큰 기본값 `MOCK_INTERNAL_SERVICE_TOKEN`.

| projectId | 재현 |
|---|---|
| `prj_alive` | 조회·markPaymentPending·start 성공 |
| `prj_seq` | mark → start → complete 순서 |
| `prj_restore` | restore 재개 |
| `prj_deleted` | 조회 404 |
| `prj_canceled` | 전이 409 |
| `prj_null_accept` | start 409 (수락 지원 null) |
| `prj_in_progress` | complete 성공 (호출자가 I-30을 지킨 경우) |
| `prj_completed` | complete 멱등 200 |
| `prj_deadline` | restore `DEADLINE_PASSED` |
| `prj_pending_apps` | restore `PENDING_APPLICATIONS_REMAIN` |

- design/: 없음. Increment 1 화면은 다음 스프린트.

## 교차 담당
- 유동우 (project-management): 4함수 제공자. 2026-08-25 함수별 정의 회신 반영 완료
  (`review/yudong-function-defs-reply.md`).
- 최윤석 (applications): 지원 수락 선행. 2026-08-26 함수별 정의 11건 전부 예
  (`review/yoonseok-function-defs-response-final.html`).

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-25 | 호출 계약 초안. PRD v6.4 §5.4 · ERD v1.4 정본 |
| 2026-08-25 | 유동우 함수별 정의 회신 반영. P3 `contractId` 본문 필수. `/internal/v1`. 최윤석 대기 |
| 2026-08-26 | prototype Mock + run.tsx. spec 규칙 1~8 PASS 24 |
| 2026-08-26 | 유동우·최윤석 Mock import 안내 (`review/mock-stub-import-guide.md`) |
| 2026-08-26 | 최윤석 함수별 정의 회신 반영. A1~A4·B1~B4·기존 1~3 전부 예 |
| 2026-08-26 | PaymentGateway 포트·Mock. sandbox는 키 있을 때만 |
| 2026-08-26 | 팀장 sandbox 키 요청 (`review/teamlead-pg-sandbox-keys.md`) |
| 2026-08-26 | Mock 공개 입구 `prototype/index.ts`. 토큰 불일치 422 |
| 2026-08-27 | `origin/develop` merge (`6f6f71c`). SPEC 합의·서명·결제 규칙 10~18 |
| 2026-08-27 | SPEC 규칙 19~22: 전이표·계약 필드·FAILED 재시도·Increment 1 백로그 |
| 2026-08-27 | 잔여 3건: `paymentId` 조회, I-17 같은 행 재시도·수수료, propose 시 agreements |
| 2026-08-27 | `negotiationId`=`agreements.id`, propose 시 agreements NOT NULL 필드 |
| 2026-08-28 | 금주 wrap. reviews SPEC은 `features/reviews/` |
| 2026-08-28 | P2: 규칙 3·4 전이 409 + FAILED 재시도 Mock. PASS 34. 취소·환불 제외 |
| 2026-08-28 | feedback_loop 3항목 반영완료. `project-transaction.service.ts` 통일 |
