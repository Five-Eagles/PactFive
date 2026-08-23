# login_sample_cursor — SPEC

## 비고

MVP 8개 기능에 포함되지 않는 시뮬레이션 샘플. "Cursor" 역할의 AI가 팀장과의 대화 없이
`docs/naming-convention.md`, `docs/domain/erd.md`, `docs/domain/prd.md`,
`features/sample-login/`, `sdd-framework/constitution.md`만 읽고 독립적으로 작성했다.

## 목적

이메일+비밀번호 로그인.

## 범위

- 포함: 이메일+비밀번호 로그인, 토큰 발급, **요청 형식 자체가 잘못된 경우(이메일 형식 오류,
  비밀번호 누락)의 처리**
- 제외: 회원가입, OAuth, 비밀번호 재설정

## 관련 엔티티

`users`: email, password_hash, role, refresh_token_hash, deleted_at

## 규칙

1. 요청 형식이 유효하지 않으면(이메일 형식이 아니거나 password가 빈 값) 400을 반환한다. 이건
   인증 실패가 아니라 요청 자체의 문제이므로 401과 분리한다. (`docs/naming-convention.md`에
   400/401 구분에 대한 명시적 규칙은 없어 자체 판단으로 추가함 — spec.md 밖 가정)
2. 계정이 없거나 비밀번호가 일치하지 않으면 401, "이메일 또는 비밀번호가 올바르지 않습니다"
3. 탈퇴 계정(deleted_at 존재)은 401, 동일 메시지
4. `password_hash`가 NULL인 소셜 전용 계정은 401, 동일 메시지
5. 로그인 성공 시 accessToken/refreshToken 발급, refreshToken 해시를 refresh_token_hash에 저장
