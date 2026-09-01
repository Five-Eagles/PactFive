# 통합 반영 기록

이 파일은 팀장이 각 기능의 prototype 코드를 `app/`에 반영할 때마다 한 줄씩 쌓입니다.
직접 편집하지 말고 `scripts/mark-synced.sh`로 기록하세요. (관련: ADR-0006, app/AGENTS.md)

| 날짜 | 반영 기능 | 반영된 커밋 (prototype 기준) | 비고 |
|---|---|---|---|
| 2026-08-27 | user-management | 41d7f4b | auth 통합 반영 |
| 2026-08-27 | contracts-payments | c63d410 | server 계약 반영(controller/repository/routes 신규 작성, web 미통합) |
| 2026-08-28 | project-management | 3e4977e | 공개 API 9종·내부 계약 7종 server 반영. web은 SCR-B01·B02·B03~B05·B07 반영, **SCR-B06(수정)·B10(재모집)은 미반영**(담당자 prototype에는 있음 — 다음 통합 대상). /internal/v1 소유권 이관 |
| 2026-08-28 | engagement | 3e4977e | 북마크 3종·추천 server 반영. web은 SCR-B08·B09 반영(북마크 버튼 포함) |
| 2026-08-28 | user-management | 8db808b | 실 Supabase 어댑터·RegistrationIntent·다중 Origin 검증 델타 반영 |
| 2026-08-28 | contracts-payments | 47c7760 | 결제 포트·토스 어댑터 반영, /internal/v1 서빙 책임 이관(순수 호출자로 전환) |
| 2026-09-01 | contracts-payments | 18f10d7 | PaymentGateway.retrievePayment(웹훅 재검증)만 반영. 공개 API 초안(negotiation-offers·contract sign·payments 7종)과 웹 패널 3종(AgreementPanel·ContractSignPanel·PaymentCheckoutPanel)은 app/에 아직 라우팅 연결 전 — 다음 통합 대상(신규 증분, Increment 1 초안) |
