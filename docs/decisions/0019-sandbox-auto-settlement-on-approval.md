# 납품 승인 직후 Sandbox 정산을 자동 실행한다

| 항목 | 내용 |
|---|---|
| 상태 | **초안 — 팀 확인 대기** (2026-10-01, 포트폴리오 정리 중 Claude가 추천안대로 구현. 팀장 위임) |
| 범위 | contracts-payments 납품 승인 → 정산 → 거래 완료 → 리뷰 연결 |
| 되돌리기 | 서버 환경변수 `AUTO_SETTLE_ON_APPROVAL=false` 또는 해당 커밋 revert |

## 왜 이 문서를 읽어야 하는가 (Context)

포트폴리오용 라이브 데모의 대표 흐름은 "등록 → 지원 → 수락 → 계약 → 결제 → 납품 → 완료 → 상호 리뷰"다.
2026-10-01 대표 흐름 자동 점검(`scripts/smoke-golden-path.js`)에서 이 흐름이 **납품 승인 다음에서 멈췄다.**

## 어떤 문제가 있는가 (Problem)

- **Fact** — 납품을 승인해도 프로젝트 거래 상태가 `IN_PROGRESS`에 머문다. 리뷰 작성은 `409 PROJECT_NOT_COMPLETED`.
- **Fact** — 거래 완료(`COMPLETED`)는 "납품 `APPROVED` ∧ 결제 `RELEASED`(정산 완료)"일 때만 일어난다(spec 규칙 26).
- **Fact** — 정산(`RELEASED`)은 spec 규칙 24에서 "다음 Increment(웹훅·배치)"로 미뤄져, 사용자 API로는 도달할 수 없다.
  개발용 `/api/internal/dev/simulate-settlement`로만 가능했다.
- **Fact** — 운영 DB 점검(2026-10-01)에서 `COMPLETED` 프로젝트는 1건뿐이고 결제 `PAID`는 0건이었다. 실제 사용자가 끝까지 간 거래는 없다.
- **Fact** — RFP §3.2.3은 완료 조건을 "의뢰인 완료 승인 + 시스템의 수수료 차감 후 지급 처리"로 정의한다. 지급 처리는 시스템이 하는 일이다.

## 알아야 할 개념 (Concept)

- **정산(Settlement)** — 의뢰인이 미리 낸 돈(에스크로)에서 플랫폼 수수료 10%를 빼고 프리랜서에게 지급하는 것.
- **Sandbox** — 실제 돈이 오가지 않는 테스트 결제 환경. 우리 서비스의 결제는 전부 Sandbox다.
- **`simulateSettlementResult`** — 정산 결과(성공/실패)를 기록하는 서비스 함수. Sandbox에는 실제 송금 API가 없어서 이 함수가 "정산 성공"을 기록한다.

## 선택지 (Options)

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| A | 승인 직후 같은 요청 안에서 Sandbox 정산 성공을 기록 | 구현 10줄, 즉시 대표 흐름 완성, RFP 문구와 일치 | 실제 PG 정산이 생기면 교체 필요 |
| B | 정산 웹훅·배치 구현 (spec이 정한 다음 Increment) | 설계 의도에 가장 가까움 | 1주 안에 불가, 서버리스 배치 인프라 필요 |
| C | 데모에서만 개발용 경로를 수동 호출 | 코드 변경 없음 | 채용 담당자가 데모에서 리뷰까지 갈 수 없음 |

## 결정 (Recommendation → Decision 초안)

**A안.** `createPublicApiService({ autoSettleOnApproval: true })`. 승인 처리 후 결제가 `PAID`이면
`simulateSettlementResult(paymentId, 'SUCCESS')`를 호출한다. 정산이 실패해도 승인은 되돌리지 않고 로그만 남긴다
(spec 규칙 24 "실패는 PAID 유지"와 같은 원칙).

- **가정** — 포트폴리오 기간 동안 실제 송금은 없다. 결제는 계속 Sandbox다.
- **바뀔 수 있는 조건** — 실제 PG 정산 API를 붙이면 이 옵션을 끄고 B안으로 간다.

## 확인

- 로컬 mock 모드 대표 흐름 점검 22단계 전부 PASS (2026-10-01).
- 기존 통합 테스트 35건 PASS.
