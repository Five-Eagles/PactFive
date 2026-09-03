# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-03
테스트한 커밋: 커밋 전 (`run.tsx` 하이브리드 AGR-01·DLV-01 검증 포함)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 160, FAIL 개수: 0)

키 없는 환경. 규칙 9 sandbox는 「해당 없음」 1건 PASS.

`npm run preview:dev`(localhost:5175)에서 합의 생성 → 대기 → 프리랜서 응답 → 수락 모달 → 거절 모달(사유 3종) → 취소 화면을 클릭으로 확인. 1280px는 `.agreement-grid` 2열. 360px는 1열 스택, 생성·응답 CTA는 sticky.

납품은 스위치 납품 전 → M01 → 검토 대기 → M03 → M02 → 정산 대기 → 완료. 1280px는 `.delivery-grid` 2열. 360px는 1열 스택, 납품 전·의뢰인 검토 CTA는 sticky. `APPROVED`+`PAID`는 「정산 처리 중」이지 완료가 아니다.

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 「start 버전 불일치 409」·토큰 불일치 422·규칙 6 버전 비증가 | 통과 |
| 2 호출 전 조회 | `run.tsx` 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | `run.tsx` 전이·멱등·취소 409·null 수락 409·COMPLETED에서 start 409·지원서 불일치 시 포트 미호출 | 통과 |
| 4 completeProjectTransaction | `run.tsx` I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등·CANCELED 409·CONTRACT_PENDING에서 complete 409 · publish는 규칙 7 | 통과 |
| 5 restorePreContractProject | `run.tsx` 재개·멱등·다른 협상 409·DEADLINE_PASSED·PENDING_APPLICATIONS_REMAIN | 통과 |
| 6 markPaymentPending | `run.tsx` 최초 기록·시각 유지·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | `run.tsx` mark → start → complete · Handoff만 propose · PAID/COMPLETED publish · throw여도 유지. Increment 1 경로는 납품 2종 미호출. 납품 Mock 경로만 publish | 통과 |
| 8 오류 코드 | `run.tsx` 5종 코드·에러 봉투만 사용 | 통과 |
| 9 PaymentGateway | `run.tsx` Mock 승인·금액 불일치. 키 없음 Mock 유지·어댑터 PgKeyMissingError·keyMissing UX. sandbox는 키 없으면 해당 없음 | 통과 |
| 10 금액 합의 | `run.tsx` 「의뢰인 제안」·이력 라벨 최초 제안·NOT_PROPOSED / WAITING_RESPONSE / ACTION_REQUIRED / AGREED 산정 | 통과 |
| 11 수락→계약 DRAFT | `run.tsx` 「수락→DRAFT」 | 통과 |
| 12 계약 상태 전이 | `run.tsx` 「첫 서명 SIGNING」·「양쪽 서명 SIGNED」 | 통과 |
| 13 signContract | `run.tsx` 「서명 멱등 최초 시각」 | 통과 |
| 14 샌드박스 결제 범위 | 규칙 9 Mock. 웹훅 E2E·결제 취소·PG 환불 없음 | 안 함 (해당 없음) |
| 15 취소 무효화 | `run.tsx` 「무효화 NOT_NEEDED」·「DONE」·멱등 | 통과 |
| 16 공개 API 경로 | `run.tsx` 「현재 조회」. GET payment 당사자 200 · 비당사자 403 · 없음 404. POST payments 준비·confirm. GET delivery 납품 없음 200 · 비당사자 403 · 없음 404 | 통과 |
| 17 라우트·UX | `run.tsx` 필수 카피(제안하기·수락하기·거절하기·계약서 확인·합의를 수락할까요?·거절 확인). 취소 우선·종료 상태 버튼 없음·의뢰인 대기 시 수정 없음. 403/404 금액 숨김. 서명·결제 기존 필수 요소 | 통과 |
| 18 Increment 1 테스트 목록 | 규칙 22로 이동 | 안 함 (해당 없음) |
| 19 계약·결제 전이표 | `run.tsx` PG 실패 키면 FAILED · 재시도 후 승인 성공 PAID. 계약 전이는 규칙 12·15 | 통과 (결제 행 Mock) |
| 20 수락 시 계약 필드 | `run.tsx` 「수락 시 계약 필드」 (`getContract`) | 통과 |
| 21 FAILED 재시도·웹훅 | `run.tsx` 같은 paymentId·새 orderId READY · 옛 orderId confirm 409 · 「retrievePayment FAILED」. 웹훅 없음 | 통과 (Mock). 웹훅은 해당 없음 |
| 22 Increment 1 백로그 | `run.tsx` 빈 생성 · 수락/거절 멱등 · 거절→restore · 비당사자 403 · 로딩 · LOAD_FAILED · 409 재조회 · 취소 후 변경 숨김 | 통과 |
| 23 납품 Increment | `run.tsx` 취소 우선 · APPROVED+PAID≠완료 · 종료 상태 납품/승인 버튼 없음 · 403 파일명 없음 · GET null 200 · 승인 PAID는 complete 미호출 | 통과 |
| UI(design/web) | 하이브리드 AGR-01·DLV-01 페이지 + 서명·결제 패널. preview:dev 1280 2열 / 360 스택 | 통과 |

규칙 4의 I-30은 호출자 검증이다. `completeProjectTransactionIfSettled`가 APPROVED∧RELEASED 전에는 포트를 부르지 않는다. 납품 승인 Mock이 `PAID`만이면 complete를 호출하지 않는다.

규칙 7의 최윤석 구간은 2026-08-26 회신으로 확정이다. 알림 4종은 포트 발행만. 납품 2종은 납품 Mock 경로에서만 발행.

## ux-philosophy.md §6 자체 점검 (합의)

| 검증 항목 | 이 화면에서 어떻게 충족하는가 (또는 왜 못 하는가) |
|---|---|
| 상태 이해 | uiState마다 배지·status-copy가 다음 행동 주체를 문장으로 알려 준다. 응답 기한은 스펙에 없어 미표시. |
| 근거 이해 | 대기·응답은 「최신 제안」, AGREED는 「확정 금액」. 수수료는 결제 패널만. |
| 작업 보호 | LOAD_FAILED 유의사항에 입력 유지 안내. prototype은 세션이 없어 새로고침 시 폼이 비워진다. |
| 복구 가능성 | LOAD_FAILED 「다시 시도」, STALE 「다시 불러오기」, 403/404 「프로젝트 확인」. |
| 선택권 | ACTION_REQUIRED에서 수락·거절·닫기. 거절 사유 3종. Increment 1 의뢰인 대기는 수정 불가. |
| 비파괴성 | 「합의를 수락할까요?」「거절 확인」+ 거래 종료 경고. |
| 접근 가능성 | 금액 `label`, 다이얼로그 `aria-modal`. 오버레이 포커스 트랩은 prototype에 없음. |

## ux-philosophy.md §6 자체 점검 (납품)

| 검증 항목 | 이 화면에서 어떻게 충족하는가 (또는 왜 못 하는가) |
|---|---|
| 상태 이해 | 역할×상태 문장. `APPROVED`+`PAID`는 「정산 처리 중」. `RELEASED`여야 「완료」. |
| 근거 이해 | 결과물 카드·납품 메시지·거래 진행. `PAID`를 정산 완료로 쓰지 않는다. |
| 작업 보호 | M01은 파일·메시지·재납품 불가 확인 뒤에만 「납품 요청」. prototype은 세션이 없다. |
| 복구 가능성 | LOAD_FAILED 「다시 시도」, STALE 「다시 불러오기」, 403/404 「프로젝트 확인」. |
| 선택권 | 의뢰인 검토에서 다운로드·승인·닫기. 반려·재납품은 없다. 「리뷰 작성」은 완료만. |
| 비파괴성 | M02 「납품을 승인할까요?」. M03 다운로드 확인. 승인만으로 완료라고 하지 않는다. |
| 접근 가능성 | 파일·메시지 `label`, 다이얼로그 `aria-modal`·`aria-labelledby`, 로딩 `aria-busy`. 포커스 트랩 없음. |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 유동우 포트 스탠드인 Mock이다. 실제 HTTP·DB는 없다.
- 웹 패널 3종·공개 API 라우트는 app 미반영. 팀장 통합 요청: `review/teamlead-public-api-panels-2026-09-03.md`.
- Toss sandbox 실호출은 루트 `.env`의 `PG_SECRET_KEY`가 있을 때만. 지금은 해당 없음.
- 알림 발송·지원 수락 구현은 최윤석. 이번 Increment는 포트 발행만.
- 위젯 실연동·에스크로·PG 환불·재제안·납품 실저장소는 Increment 밖이다.

## 팀장에게 물어봐야 하는 것

요청 전문: `review/teamlead-pg-sandbox-keys.md`.

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 루트 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지

답이 없어도 포트·Mock 골격은 진행한다.
2026-08-31 미수신. 외부 대기는 `review/external-wait-2026-08-31.md`.
