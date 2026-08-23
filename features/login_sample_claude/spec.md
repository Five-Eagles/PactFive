# login_sample_claude — SPEC

## 비고

이 기능은 실제 MVP 8개 기능에 포함되지 않는 **시뮬레이션 샘플**입니다. "팀장과의 대화 세션이 없는
상태에서, 다른 AI 툴이 리포에 커밋된 문서만으로 login 기능을 처음부터 구현하면 어떤 결과가
나오는가"를 검증하기 위해 만들었습니다. `features/sample-login/`과 별개로, **이 폴더의 작성자는
Claude를 가정**하고 `docs/naming-convention.md`, `docs/domain/erd.md`, `docs/domain/prd.md`,
`features/sample-login/`(예시), `sdd-framework/constitution.md`만 읽은 상태에서 작성되었습니다.

## 목적

이메일+비밀번호 로그인 한 가지 플로우만 다룬다.

## 범위

- 포함: 이메일+비밀번호 로그인, accessToken·refreshToken 발급
- 제외: 회원가입, OAuth(Google/Kakao) 로그인, 비밀번호 재설정

## 관련 엔티티 (근거: `docs/domain/erd.md` users 엔티티)

`users.email`, `users.password_hash`, `users.role`, `users.refresh_token_hash`, `users.deleted_at`

## 규칙

1. `email`에 해당하는 계정이 없거나 `password_hash`가 일치하지 않으면 401을 반환하고 메시지는
   "이메일 또는 비밀번호가 올바르지 않습니다"로 통일한다. 계정 존재 여부가 메시지로 드러나지
   않게 하기 위함이다.
2. `deleted_at`이 NULL이 아닌 계정(탈퇴)은 로그인을 차단하고 규칙 1과 같은 메시지로 401을
   반환한다. 탈퇴 여부를 노출하지 않는다.
3. `password_hash`가 NULL인 계정(소셜 로그인 전용, ERD 비고: "소셜 전용 계정은 비어 있음")은
   이메일 로그인 자체를 시도하지 않고 규칙 1과 같은 메시지로 401을 반환한다. 소셜 전용 여부를
   노출하지 않는다.
4. 로그인에 성공하면 accessToken(단기)과 refreshToken(장기)을 발급한다. refreshToken은 해시로
   변환해 `users.refresh_token_hash`에 저장(기존 값 교체)한다.
5. 인증이 필요한 이후 API 호출은 `Authorization: Bearer <token>` 헤더로 accessToken을 전달한다
   (근거: PRD §1.4, `docs/domain/erd.md`).

## 크기/비고

이 문서는 `sdd-framework/templates/feature-spec-template.md`의 소프트 한도(300줄)에 크게
못 미치므로 분리하지 않는다.
