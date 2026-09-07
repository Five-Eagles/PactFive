# user-management

- 담당자: 오민혁
- 현재 단계: Step 4 — high-fi·구현 초안·자동 검증
- 포함: 이메일/OAuth 가입·로그인, 이메일 확인, 고립 계정 가입 복구, 세션·안전한 `returnTo`,
  회원 탈퇴의 PROVISIONAL spec/API 계약과 비활성 UI prototype
- 제외: 프로필 상세, 비밀번호 재설정, 회원 탈퇴 API client·서버·DB·worker 구현, `app/` 통합과 배포 설정

## 작업 원본

- `spec.md` — 기능 범위와 23개 확정 인증 규칙, 탈퇴 잠정 규칙 WD-01~WD-08
- `api-contract.md` — BFF 인증 API 계약과 구현 전 검토용 탈퇴 계약
- `design/high-fi.html` — 로그인 high-fi
- `design/high-fi-sign-up.html` — 회원가입·가입 복구 high-fi
- `design/high-fi-email-confirmation.html` — 이메일 확인 high-fi
- `design/high-fi-account-withdrawal.html` — 회원 탈퇴 상태별 high-fi(실제 요청 미전송)
- `prototype/` — 서버·웹·Mock 구현 초안과 `run.tsx` 검증
- `test-report.md` — 검증 결과, UX 자체 점검, 미해결 통합 조건

## 2026-09-04 상태

가입과 이메일 확인 화면은 최신 feature high-fi 구조와 디자인 토큰에 맞춰 보완했다. 참조 화면은
폼 리듬과 상태 안내 순서만 사용했으며 API·업무 규칙은 변경하지 않았다. 실제 앱 router 연결,
fragment의 pre-React bootstrap, 단일 AuthProvider 상태 소유권, 영속 DB 저장소와 배포 rewrite는
팀장 통합 전까지 완료로 보지 않는다. 성공·오류 DTO runtime 검증, token query 제거, 확인 재시도·
현재 세션 로그아웃 경계까지 보완했다. 회원 탈퇴는 `/settings/account/withdrawal`의 상태별 high-fi와
네트워크 없는 React 화면만 추가했다. API·재인증 proof 발급·DB transaction·provider cleanup은 여전히
review gate 대상이다. feature 자동 검증은 53/53이며 strict scoped TypeScript와 preview production
build를 통과했다.
