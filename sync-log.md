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
| 2026-08-29 | project-management | 3e4977e | SCR-B06(수정)·SCR-B10(재모집) web 반영 완료 — 서버·API 클라이언트·타입은 1차 반영에 이미 있었고 화면·라우팅만 추가. SCR-B10은 모달로 반영(판단 필요 — feedback_loop 항목 1). `shared/ui/tokens.css`에 오버레이·마이크로 인터랙션 모션 첫 적용(design-tokens.md §13) |
| 2026-09-01 | contracts-payments | 18f10d7 | PaymentGateway.retrievePayment(웹훅 재검증)만 반영. 공개 API 초안(negotiation-offers·contract sign·payments 7종)과 웹 패널 3종(AgreementPanel·ContractSignPanel·PaymentCheckoutPanel)은 app/에 아직 라우팅 연결 전 — 다음 통합 대상(신규 증분, Increment 1 초안) |
| 2026-09-03 | project-management | 66bc09e | CR-0010 — 8/27(3e4977e) 이후 밀려 있던 7커밋(46a476b·7c82773·d69e8e8·de5a001·39b7c89·ef1411e·1de2646) + 2026-09-03 검색어 규칙 62·63(matchesKeyword, 66bc09e) 반영. `.env.example`에 `INTERNAL_SERVICE_TOKEN` 추가(CR-0005 — 코드는 이미 `app.ts`의 공유 미들웨어로 처리돼 있어 문서만 보강). `DestructiveActionSummary`·`MoneyBreakdown`·`useDraft` 신규, `ProjectEditPage`에 모집 일정 칸, `ProjectManagePage`에 파괴적 행동 확인 다이얼로그(모집 마감·취소·삭제 3종 — design/high-fi-manage.html 기준, prototype의 2종에서 확장), `project.types.ts`에 `budgetSource`/`budgetSourceAt`(ERD 미반영 — CR-0007 팀장 확인 필요), `isBookmarked` 제거(CR-0008). run.tsx 323 PASS 유지. feedback_loop/2026-09-03/project-management.md 참고 |
| 2026-09-03 | engagement | 1de2646 | CR-0010 — 8/27(3e4977e) 이후 밀려 있던 추천 사유(reason·matchedSkills, 39b7c89) + `GET /bookmarks/ids`(CR-0008, 1de2646) 반영. 서버(`bookmark.service.ts`·`bookmark.controller.ts`·`bookmark.routes.ts`)와 화면(`RecommendationSection`에 사유 문구, `App.tsx`의 `renderBookmark`가 `useBookmarkedIds`로 초기 저장 상태 연결) 모두 반영. run.tsx 108 PASS 유지. feedback_loop/2026-09-03/engagement.md 참고 |
