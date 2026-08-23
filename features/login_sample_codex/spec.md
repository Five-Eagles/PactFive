# login_sample_codex — SPEC

## 비고

MVP 8개 기능에 포함되지 않는 시뮬레이션 샘플. "Codex" 역할의 AI가 팀장과의 대화 없이
`docs/naming-convention.md`, `docs/domain/erd.md`, `docs/domain/prd.md`,
`features/sample-login/`, `sdd-framework/constitution.md`만 읽고 독립적으로 작성했다.

## 목적

이메일+비밀번호 로그인.

## 범위

포함: 이메일+비밀번호 로그인, 토큰 발급.
제외: 회원가입, OAuth, 비밀번호 재설정.

## 관련 엔티티

`users`: email, password_hash, role, refresh_token_hash, deleted_at (docs/domain/erd.md 참고)

## 규칙

1. email/password가 일치하지 않으면 401, "이메일 또는 비밀번호가 올바르지 않습니다"
2. 탈퇴 계정(deleted_at 존재)은 로그인 불가 → 401, 동일 메시지
3. 로그인 성공 시 accessToken/refreshToken 발급, refreshToken 해시를 refresh_token_hash에 저장
4. 인증 필요 API는 Authorization: Bearer 헤더 사용
