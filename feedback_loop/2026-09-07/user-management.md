# user-management 피드백 — 2026-09-07 이메일 확인 링크 연결 수정

반영 커밋(prototype 기준): `78e49dd`
통합 기준: `origin/develop 69c182b`, 작업 브랜치 `fix/auth-pricing-integration`
sync-log.md 기록: 있음

> 오민혁 사용자에게 `app/` 팀장 전용 규칙을 설명했고, 이번 이메일 인증·AI 분석 ID 오류 두 건에
> 한해 직접 수정 승인을 받았다. 팀 공통 설정·API 계약·탈퇴 구현으로 범위를 확장하지 않는다.
> 이 기록은 브랜치의 수정·검증 기록이며 develop 병합이나 실서비스 배포 완료를 뜻하지 않는다.

## 항목 1 — fragment 인증 값을 라우터 렌더 전에 캡처한다

상태: 미확인

**Fact — 원본과 통합 코드의 차이**
- 원본은 `/auth/confirm#tokenHash=…`를 페이지 메모리로 캡처한 뒤 URL을 정리하도록 정의했다.
- 기존 앱 라우트는 query의 `token`/`tokenHash`만 읽어 원본 메일 링크를 처리하지 못했다.

**어떻게 채웠는지**
- `app/web/src/features/user-management/auth.bootstrap.ts`에 React 비의존 캡처 함수를 둔다.
- `App.tsx`의 조립 단계에서 BrowserRouter 최초 렌더 전에 캡처한다. `main.tsx`는 유지한다.
- `auth.routes.tsx`는 메모리 값을 `EmailConfirmationPage`에 전달한다. 확인 POST는 기존처럼
  사용자가 버튼을 눌러야만 실행한다. 최초 문서 진입을 처리하며 SPA 내부에서 새 인증 링크를
  만들어 넣는 기능은 추가하지 않는다.
- fragment는 제거하고 query의 `token`, `tokenHash`, `token_hash`도 제거한다. query 값을
  인증 정보로 사용하는 기존 통합 동작은 원본 계약에 맞춰 제거했다. 다른 query는 보존한다.
- StrictMode 재렌더·오류 재시도는 같은 페이지 메모리를 사용한다. 전체 새로고침하면 값이
  사라져 원본 메일 링크를 다시 열어야 한다. 저장소나 DOM에는 인증 값을 저장하지 않는다.

**왜 그렇게 채웠는지 (근거)**
- `features/user-management/prototype/web/email-confirmation-token.ts` 및 원본 bootstrap
  계약을 app의 라우터 조립 경계에 맞춰 재해석했다. API·업무 규칙·화면 구조는 변경하지 않았다.

**검증 — 2026-09-07**
- `npm run test:integration`: 28/28 PASS (이메일 8, 등록 초안 12, 실제 앱 서버 claim 8).
- 회원관리 prototype 53/53, AI prototype 27/27, 프로젝트 prototype 331/331 PASS.
- `npm --prefix app/web run build`, `npm --prefix app/server run build`: PASS.
- 로컬 브라우저에서 fragment+query 정리, 확인 버튼 표시, 클릭 전 확인 POST 없음, 클릭 뒤
  fragment 값의 POST 전달, 503 후 재시도 화면, 새로고침 후 `확인 링크 필요`를 확인했다.
  합성 값과 loopback 수신기를 사용했으며 실제 메일 발송·계정 생성·공급자 인증은 실행하지 않았다.
- 디자인/색상/모션/화면 배치는 수정하지 않았다. `npm run check:design`은 기존 `.success`
  클래스 누락(applications/contracts-payments/reviews 시안 vs 공통 tokens.css)으로 FAIL이다.
  해당 검사 입력 파일은 `origin/develop`과 동일하며 이번 승인 범위 밖이므로 수정하지 않았다.

**담당자 메모**
- 9/5 피드백의 역할 UI 단순화·429 카운트다운 생략 승인은 이 수정과 별개로 남는다.
- 실 배포의 404/API rewrite·DB 연결·실제 공급자 E2E 검증도 이번 수정으로 해결됐다고 보지 않는다.
