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

**상태 2026-08-31: 미수신.** Increment 1 Mock은 통과. 실호출·위젯은 키 수신 후.
대기 4건 정본: [external-wait-2026-08-31.md](external-wait-2026-08-31.md).

---

## Discord / 이슈에 붙일 단락

조준영(contracts-payments)입니다. Toss sandbox 계정 생성은 팀장님께 맡기고, 아래만 확인 부탁드립니다. (1) sandbox 클라이언트 키·시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY` 이름으로 줄 수 있는지. (2) 전달은 채팅 평문 금지, 로컬 루트 `.env`만 — 이름 기준은 리포 루트 `.env.example`. (3) sandbox에서 결제 승인·취소가 켜져 있는지. (4) 위젯용 클라이언트 키와 서버 시크릿이 구분되는지. 답이 없어도 포트·Mock 골격은 이미 진행했습니다(`PaymentGateway.confirmPayment`, Mock 성공 `pay_mock_ok` / 금액 불일치). 시크릿이 오면 `prototype/run.tsx` sandbox 실호출만 이어서 확인하겠습니다.

---

## 확인할 것

1. sandbox 클라이언트 키 / 시크릿 키를 `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지
2. 전달 방법 — 채팅 평문 금지, 로컬 루트 `.env`만
3. sandbox에서 결제 승인·취소가 켜져 있는지
4. 위젯용 클라이언트 키와 서버 시크릿이 구분되는지
