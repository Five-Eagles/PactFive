# 8/27 SPEC용 설계서 평가 — 조준영

| | |
|---|---|
| 날짜 | 2026-08-27 |
| 목적 | 목요일 SPEC 작성 항목이 설계서로 커버되는지 판정하고 정본을 고정 |
| 정본 순서 | ERD v1.4 → PRD v6.4 → 2차 v1.1 호출 조건 → Toss/취소 경계 → 프론트 v2.0은 Increment 1 UX |
| 이미 FACT | 규칙 1~8(4함수) · 규칙 9(`PaymentGateway`) · 유동우·최윤석 회신 |

판정: **충족** = SPEC으로 옮김. **부분** = 근거는 있으나 충돌·한 줄. **공백** = 설계서에 규칙 없음.

11시 `origin/main` pull: `cd3d1ac` Develop (#12). 추가 통합 커밋은 아직 없다. enum은 어제와 같다
(`agreement_status` 3값, `contract_status` 4값).

---

## 15항 판정

| # | 작성 항목 | 근거 | 판정 |
|---|---|---|---|
| 1 | 수락 후 계약서 생성 | 2차 v1.1 수락 트랜잭션. 프론트는 `CREATED` | 부분 |
| 2 | 계약 상태 전이 | ERD `DRAFT·SIGNING·SIGNED·CANCELED`. 2차 한 줄 | 부분 |
| 3 | 양측 전자서명 | 흐름만. 서명 설계서 없음 | 공백 |
| 4 | 중복 서명 멱등 | PRD I-19. 설계서 API 없음 | 부분 |
| 5 | 최초 서명 시각 보존 | PRD D-11·I-19 | 부분 |
| 6 | 결제 요청·승인·실패·취소 | Toss 준비·승인·웹훅 충족. **환불은 Toss MVP 제외** | 부분 |
| 7 | 결제 대기 전환 | spec 규칙 6 `markPaymentPending` | 충족 |
| 8 | 에스크로·정산 범위 | Toss §1.3: 샌드박스는 에스크로 아님 | 충족 |
| 9 | 계약 취소·무효화 | 무효화 설계서 + `invalidateAgreementAndContract` | 충족 |
| 10 | restore 호출 조건 | spec 규칙 5. 최종 거절만 | 충족 |
| 11 | 계약·결제 감사 | ERD `contract_signature_audits`, Toss attempts | 부분 |
| 12 | 오류·로딩·빈 UX | 프론트 v2.0 금액합의만. 서명·결제 없음 | 부분 |
| 13 | 주요 API 목록 | v1.1 `negotiation-offers` vs 프론트 `/agreements` 5종 | 부분 |
| 14 | 프론트 라우트 | 화면 ID만. 경로 표 없음 | 부분 |
| 15 | 테스트·완료 기준 | AGR-S01~S12, Toss 인수. 서명은 PRD만 | 부분 |

## 치명 충돌 3건

1. 협상: 2차 양측 재제안 vs 프론트 단방향
2. 계약 생성 상태: `DRAFT`(ERD) vs `CREATED`/`READY`(프론트)
3. 전자서명 설계서 부재

2차 `PENDING`/`SUPERSEDED`/`CANCELED`(철회)는 ERD `agreement_status` 3값과 어긋난다.

---

## 최적안 (SPEC에 이 값을 쓴다)

이미 FACT인 4함수·restore·`markPaymentPending`은 다시 열지 않는다.

1. **협상.** 도메인은 다회차. 활성은 최신 `round` 1건. 저장 enum은 `PROPOSED`·`ACCEPTED`·`REJECTED`만.
   2차 `PENDING` → `PROPOSED`. `SUPERSEDED`는 이전 round. 철회는 Increment 1 제외.
   Increment 1 화면: 의뢰인 제안 + 프리랜서 수락/거절 (프론트 AGR-01).
   REST 정본: `negotiation-offers`. 프론트 `/agreements` 5종은 폐기.
2. **계약.** `DRAFT` → 첫 서명 `SIGNING` → 양쪽 `SIGNED`. 무효화 `CANCELED`.
   화면 `CREATED`/`READY`는 `DRAFT` 별칭. API에 넣지 않음.
3. **서명.** PDF를 기다리지 않음. `signContract`. 취소된 프로젝트 거부(D-04).
   같은 서명자 감사 1건·최초 시각 유지(I-19). 취소 후에도 감사 삭제 금지(D-11).
   멱등 키 `contract-sign-{contractId}-{signerId}`.
4. **결제.** 샌드박스 준비·승인·실패 복구까지. 에스크로·실정산·PG 환불 제외.
5. **취소.** 최종 거절만 restore. 프로젝트 취소는 `invalidateAgreementAndContract`.
   `paymentPendingAt` 이후 일반 취소 금지.

납품·리뷰 설계서는 이번 SPEC 범위 밖이다.
