# contracts-payments 테스트 결과

담당자: 조준영            테스트 날짜: 2026-08-31
테스트한 커밋: Increment 1 Mock (이 커밋)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 60, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 공통 봉투 | `run.tsx` 「start 버전 불일치 409」·토큰 불일치 422·규칙 6 버전 비증가 | 통과 |
| 2 호출 전 조회 | `run.tsx` 살아있는 프로젝트 / 없음·삭제 404 | 통과 |
| 3 startProjectTransaction | `run.tsx` 전이·멱등·취소 409·null 수락 409·COMPLETED에서 start 409·지원서 불일치 시 포트 미호출 | 통과 |
| 4 completeProjectTransaction | `run.tsx` I-30 미충족 시 포트 미호출 · COMPLETED 전이·멱등·CANCELED 409·CONTRACT_PENDING에서 complete 409 | 통과 |
| 5 restorePreContractProject | `run.tsx` 재개·멱등·다른 협상 409·DEADLINE_PASSED·PENDING_APPLICATIONS_REMAIN | 통과 |
| 6 markPaymentPending | `run.tsx` 최초 기록·시각 유지·취소 409·contractId 누락 422 | 통과 |
| 7 호출 순서 | `run.tsx` markPaymentPending → start → complete (시드는 이미 CONTRACT_PENDING) | 통과 |
| 8 오류 코드 | `run.tsx` 5종 코드·에러 봉투만 사용 | 통과 |
| 9 PaymentGateway | `run.tsx` Mock 승인 성공·금액 불일치. sandbox는 키 없으면 해당 없음 | 통과 |
| 10 금액 합의 | `run.tsx` 의뢰인 제안 round 1 | 통과 |
| 11 수락→계약 DRAFT | `run.tsx` 수락→DRAFT · 수락 멱등 | 통과 |
| 12 계약 상태 전이 | `run.tsx` 첫 서명 SIGNING · 양쪽 SIGNED | 통과 |
| 13 signContract | `run.tsx` 같은 서명자 재호출 시 최초 시각 유지 | 통과 |
| 14 샌드박스 결제 범위 | 규칙 9 Mock. 위젯 실연동·PG 환불은 Toss MVP 아님 | 안 함 (해당 없음) |
| 15 취소 무효화 | `run.tsx` NOT_NEEDED · DONE · 같은 cancellationId 멱등 | 통과 |
| 16 공개 API 경로 | `run.tsx` GET current가 제안 후 같은 offerId를 돌려줌 | 통과 |
| 17 라우트·UX | `run.tsx` 3화면 필수 텍스트 + 로딩·실패·409·취소 숨김 | 통과 |
| 18 Increment 1 테스트 목록 | 규칙 22로 이동 | 해당 없음 |
| 19 계약·결제 전이표 | `run.tsx` PG 실패 키면 FAILED · 재시도 후 승인 성공 PAID | 통과 (결제 행 Mock) |
| 20 수락 시 계약 필드 | `run.tsx` terms_snapshot schemaVersion·amount·projectTitle | 통과 |
| 21 FAILED 재시도·웹훅 | `run.tsx` 새 orderId READY · 옛 orderId 409 · retrievePayment FAILED. 웹훅 HTTP는 해당 없음 | 통과 |
| 22 Increment 1 완료 기준 | `run.tsx` 빈 생성·거절 restore·거절 멱등·비당사자 403·UX 4종 | 통과 |
| UI(design/web) | design low-fi 3화면 + `prototype/web/` 필수 요소 | 통과 |

규칙 4의 I-30은 호출자 검증이다. `completeProjectTransactionIfSettled`가 APPROVED∧RELEASED 전에는 포트를 부르지 않는다.

규칙 7의 최윤석 구간(수락 → 잔여 PENDING 거절 → 알림)은 2026-08-26 회신으로 확정이다. 시드
`CONTRACT_PENDING`은 그 세 단계가 끝난 상태다.

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 HTTP·DB 없는 Mock이다.
- Toss sandbox 실호출은 `PG_SECRET_KEY`가 있을 때만. 지금은 해당 없음.
- 위젯 실연동·에스크로·`RELEASED`·PG 환불·재제안은 Increment 1 제외.

## 팀장에게 물어봐야 하는 것

요청 전문: `review/teamlead-pg-sandbox-keys.md` (Discord/이슈 한 단락).

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 로컬 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지

답이 없어도 포트·Mock 골격은 진행한다. 시크릿이 오면 `run.tsx` sandbox 실호출만 이어서 확인.
