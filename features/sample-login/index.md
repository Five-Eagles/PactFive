# sample-login Index

**샘플 — 실제 기능 아님.** `sdd-framework/feature-workflow.md` 검증용 (`AGENTS.md` 참고).

## 담당자
- 팀장 (워크플로우 검증용으로 직접 작성)

## 스펙 (features/sample-login/)
- spec.md 핵심 요약: 이메일+비밀번호 로그인. 회원가입·OAuth·비밀번호 재설정은 범위 밖.
- design/, prototype/ 구성: design/low-fi.html (low-fi 인터랙티브 와이어프레임),
  prototype/{server,mock,web}/ (컨트롤러·서비스·레포지토리 + Mock + 컴포넌트·훅)

## 프론트엔드 (prototype/web/)
- 주요 컴포넌트: `LoginForm.tsx`
- 주요 훅: `useAuth.ts`
- Mock 계약 상태: `prototype/mock/auth.mock.ts`가 `api-contract.md`와 동일한 응답 형태 반환
- 로컬 검증: `npx tsx prototype/run.tsx` (성공·실패 케이스 각 1회 실행, 통과 확인됨)
- UI 검증: `run.tsx`가 `LoginForm`을 렌더링해 `design/low-fi.html`의 필수 요소 목록(이메일·비밀번호·로그인)이 전부 나타나는지 확인 — 의도적으로 깨뜨려서 실패 감지되는 것까지 확인함

## 백엔드 (prototype/server/)
- 계층 구성: `auth.controller.ts` → `auth.service.ts` → `auth.repository.ts`
- 주요 API 엔드포인트: `POST /auth/login`

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-20 | 최초 작성 — feature-workflow.md 검증용 샘플 |
