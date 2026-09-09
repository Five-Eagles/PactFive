# Toss sandbox 키 확인 요청 — 팀장

| | |
|---|---|
| 받는 사람 | 팀장 (Toss 계정 생성·키 발급) |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-08-26 |
| 정본 | 리포 루트 `.env.example` · naming `PG_CLIENT_KEY` / `PG_SECRET_KEY` |
| 목적 | sandbox 키 이름·전달 방법·승인/취소 활성·위젯/시크릿 구분을 확인 |

계정 생성은 팀장. 조준영은 키 값과 전달 방법만 받는다. 시크릿은 채팅·깃에 넣지 않는다.
답이 없어도 `PaymentGateway` 포트·Mock 골격은 이미 진행한다.

**상태 2026-09-09: 수신 — 이 요청은 닫혔다.** 루트 `.env`에 `PG_CLIENT_KEY`·`PG_SECRET_KEY`가
들어와 있고 sandbox 실호출이 동작한다. 확인 4건은 아래 「회신 결과」 참고. 키 값은 이 문서에
적지 않는다. 대기 3건 정본: [external-wait-2026-08-31.md](external-wait-2026-08-31.md).

## 회신 결과 (2026-09-09 실행으로 확인)

키를 받아 물어본 것을 코드로 확인했습니다. 별도 답변을 기다릴 필요가 없어졌습니다.

| # | 확인할 것 | 결과 |
|---|---|---|
| 1 | `PG_CLIENT_KEY` · `PG_SECRET_KEY` 이름 | 그 이름으로 들어왔다 |
| 2 | 전달은 루트 `.env`만 | 지켜졌다. 깃에 값이 올라간 곳은 없다 |
| 3 | sandbox 승인·취소 활성 | 승인 경로는 활성. **취소는 미확인**(아래 참고) |
| 4 | 위젯 키와 서버 시크릿 구분 | 구분된다 — 클라이언트 `test_gck_`, 시크릿 `test_gsk_` |

**실호출 검증.** `prototype/run.tsx`의 규칙 9 프로브 2건이 `api.tosspayments.com`을 실제로
호출하고 통과합니다 — 잘못된 `paymentKey` 승인이 `PAYMENT_CONFIRM_FAILED`로 떨어지고,
없는 주문 조회도 같은 코드로 떨어집니다. 키가 살아 있고 인증이 통한다는 뜻입니다.

**검증 건수가 키 유무로 갈립니다.** 키가 있으면 **PASS 347**, 없으면 **PASS 346**입니다
(프로브 2건 ↔ 「해당 없음」 1건). `test-report.md`의 347은 키가 있는 쪽 숫자입니다.

**3번은 절반만 닫혔습니다.** 승인 실패 경로만 확인했고 **성공 승인과 취소는 호출하지
않았습니다.** 유효한 `paymentKey`는 결제창을 거쳐야 나오고, PG 환불·취소는 이번 Increment
밖입니다(`spec.md:17`·`:208`). 위젯을 붙일 때 함께 확인할 일로 남깁니다.

---

## Discord / 이슈에 붙일 단락

조준영(contracts-payments)입니다. Toss sandbox 계정 생성은 팀장님께 맡기고, 아래만 확인 부탁드립니다. (1) sandbox 클라이언트 키·시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY` 이름으로 줄 수 있는지. (2) 전달은 채팅 평문 금지, 로컬 루트 `.env`만 — 이름 기준은 리포 루트 `.env.example`. (3) sandbox에서 결제 승인·취소가 켜져 있는지. (4) 위젯용 클라이언트 키와 서버 시크릿이 구분되는지. 답이 없어도 포트·Mock 골격은 이미 진행했습니다(`PaymentGateway.confirmPayment`, Mock 성공 `pay_mock_ok` / 금액 불일치). 시크릿이 오면 `prototype/run.tsx` sandbox 실호출만 이어서 확인하겠습니다.

---

## 확인할 것

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 로컬 루트 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지
