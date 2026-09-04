# contracts-payments Index

## 담당자
- 조준영 (contracts-payments · reviews)

## 스펙 (features/contracts-payments/)
- spec.md: 합의·서명·샌드박스 결제 설계 확정 + 4함수·PG 포트 FACT.
  정본 고정은 `review/spec-design-eval.md`. 규칙 19~22는 전이표·필드·FAILED·백로그.
- api-contract.md: 내부 4함수 + 공개 API 초안 (`negotiation-offers`, `signContract`, 결제, 납품 4종).
  프론트 `/agreements` 5종은 폐기.
- review/: 교차 담당 확인 요청·회신.
  Mock import 안내는 `review/mock-stub-import-guide.md` (유동우·조준영 지원·팀장 알림).
  팀장 sandbox 키 요청은 `review/teamlead-pg-sandbox-keys.md`.
  외부 대기(키·14일·REVIEW_CREATED·알림 4종)는 `review/external-wait-2026-08-31.md`.
  알림 포트·수락 손잡이 계약은 `review/yoonseok-ports-contract.md` (수락→결제→리뷰 호출 순서).
  알림 import 입구는 `review/mock-stub-import-guide.md` 알림·손잡이 절.
  8/27 설계서 평가·최적안은 `review/spec-design-eval.md`.
  금주 마감은 `review/week-wrap-2026-08-28.md`.
  ADR-0012 패널 vs 레퍼런스 확인은 `review/reference-panel-gap-2026-09-02.md`.
  팀장(알림)·조준영(지원) 접점 확정 요청은 `review/yoonseok-ports-confirm-2026-09-02.md`.
  팀장 패널 이식성 확정 요청은 `review/teamlead-panel-portability-2026-09-02.md`.
  팀장 공개 API·패널 3종 통합 요청은 `review/teamlead-public-api-panels-2026-09-03.md`.
- prototype/: 유동우 포트 스탠드인 Mock + 조준영 호출 서비스 + `PaymentGateway` Mock.
  키는 리포 루트 `.env`. 없으면 Mock·`PgKeyMissingError`. 다른 기능은 `prototype/index.ts`만 import한다.
  `NotificationTriggerPort`는 publish만. 발송은 팀장.
  공개 API 스탠드인은 `createPublicApiMock` (`prototype/index.ts` export).
  GET `/api/v1/payments/:paymentId` (`getPayment`)와 POST 준비·승인 (`preparePayment`·`confirmPayment`) 포함.
  GET `/api/v1/payments/:paymentId/settlement` (`getSettlement`)는 결제 행+납품+프로젝트를 조립한다.
  GET `/api/v1/projects/:projectId/cancellation` (`getCancellation`)는 프로젝트+합의·계약+무효화 결과를 조립한다.
  브라우저 `POST /cancel`은 이 폴더가 부르지 않는다.
  `npx tsx prototype/run.tsx`로 spec 규칙 1~9·10~13·15·16·17·19·20~23 Mock을 확인한다.
  합의 화면은 하이브리드 AGR-01(페이지 본문, ViewModel). `/agreements` 5종 폐기 유지.
  서명 화면은 하이브리드 CTR-01(페이지 본문, ViewModel). 설계서 신설 `CONTRACT_*` 코드는 쓰지 않는다.
  결제 화면은 하이브리드 PAY-01(페이지 본문, ViewModel). 설계서 신설 `PAYMENT_FORBIDDEN` 코드는 쓰지 않는다.
  정산 화면은 하이브리드 SET-01(페이지 본문, ViewModel). 설계서 신설 `SETTLEMENT_*` 코드·지급 버튼은 쓰지 않는다.
  취소 화면은 하이브리드 CAN-01(페이지 본문, ViewModel). 설계서 신설 `CANCEL_*` 코드·A-07 POST는 쓰지 않는다.
  납품 화면은 하이브리드 DLV-01(페이지 본문, ViewModel). 네이밍 2경로
  (`POST /contracts/:id/deliveries` + `POST /deliveries/:id/approve`)는 쓰지 않는다.
  I-30은 화면에서 `APPROVED`+`PAID`(정산 대기)와 `APPROVED`+`RELEASED`(완료)를 나눈다.

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

- design/: high-fi (`agreement.html` · `contract-sign.html` · `payment.html` · `delivery.html` · `settlement.html` · `cancellation.html`).
  합의·납품은 페이지 본문(최대 1200px, 8:4). 서명·결제·정산·취소는 페이지 본문(ViewModel). 앱 셸 없음.
  `_tokens.css`는 design-system v1.0 사본. 키 없음 UX는
  `prototype/web/PaymentPanel.tsx` `view="keyMissing"`.
  오버레이·reduced-motion은 `design/panel.css`. 합의 거절은 확인 다이얼로그 (앱 셸·stagger 없음).
  화면 카피는 상황 문장. 합의·서명·결제 응답 기한은 스펙에 없어 미표시.

## 교차 담당
- 유동우 (project-management): 4함수 제공자. 2026-08-25 함수별 정의 회신 반영 완료
  (`review/yudong-function-defs-reply.md`).
- 조준영 (applications): 지원 수락 선행. 손잡이·S1·S2는 2026-09-03 예.
  (`review/yoonseok-ports-confirm-2026-09-02.md`). 2026-08-26 A1–A4 예 유지.
- 팀장 (notifications): 알림 4종 발송. 조준영은 `publish*`만.
  계약은 `review/yoonseok-ports-contract.md`.

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
| 2026-08-31 | 외부 대기 고정 (`review/external-wait-2026-08-31.md`). 키·14일·오민혁·최윤석 |
| 2026-08-31 | 루트 `.env` 정본. 키 없음 Mock·`PgKeyMissingError`·`view="keyMissing"` |
| 2026-08-31 | high-fi 패널 3화면 (합의·서명·결제). 앱 셸 없음. 토큰 클래스만 |
| 2026-08-31 | `NotificationTriggerPort` 발행만. `AcceptedApplicationHandoff`. 발송·수락 미구현 |
| 2026-09-01 | 공개 API Mock 문서 동기화. run.tsx가 규칙 10~13·15·16·20~22까지 확인. 실측 PASS 81 |
| 2026-09-02 | 공개 GET payment Mock (`getPayment` 당사자 200·비당사자 403·없음 404). 실측 PASS 83 |
| 2026-09-02 | ADR-0012 확인. 패널 vs 레퍼런스 어긋남 (`review/reference-panel-gap-2026-09-02.md`) |
| 2026-09-02 | 패널에 오버레이·reduced-motion 리듬 이식. 앱 셸·stagger 없음 |
| 2026-09-02 | 수락→결제→리뷰 호출 순서. 최윤석 import 입구 (`yoonseok-ports-contract` · `mock-stub-import-guide`) |
| 2026-09-02 | 최윤석·팀장 확정 요청 (`yoonseok-ports-confirm` · `teamlead-panel-portability`) |
| 2026-09-02 | 토큰 정본 일치. 서명 로딩/실패·결제 상태·거절 확인 다이얼로그. 실측 PASS 87 |
| 2026-09-02 | UX 카피 반영. 실패·로딩은 상황 문장. 결제 금액·수수료·정산액 구분. 합의·서명·결제 응답 기한은 스펙에 없어 미표시. 실측 PASS 89 |
| 2026-09-03 | 회신 대기 중 재실측. `run.tsx` PASS 89. mock-stub-import-guide 검증 수를 89로 맞춤 |
| 2026-09-03 | 공개 API Mock에 `preparePayment`·`confirmPayment` 파사드. 팀장 통합 요청 `review/teamlead-public-api-panels-2026-09-03.md`. 실측 PASS 91 |
| 2026-09-03 | 알림 발송 담당을 팀장으로. applications 손잡이·S1·S2는 조준영 확정 |
| 2026-09-03 | 하이브리드 AGR-01. `/agreements` 5종 폐기 유지. `run.tsx` 상태 산정·필수 카피. 실측 PASS 120 |
| 2026-09-03 | 하이브리드 DLV-01. 네이밍 2경로 미사용. I-30 화면 구분. `run.tsx` 실측 PASS 163 |
| 2026-09-04 | 하이브리드 PAY-01. 라우트·오류 코드 유지. Sandbox 페이지·ViewModel. 실 Toss 미연동 |
| 2026-09-04 | 하이브리드 SET-01. 정산 조회 GET 조립. 지급 버튼·운영 시뮬레이션 없음 |
| 2026-09-04 | 하이브리드 CAN-01. 취소 결과 GET 조립. A-07 POST·환불 없음 |
