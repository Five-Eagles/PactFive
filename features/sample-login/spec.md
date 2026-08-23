# sample-login — SPEC

## 비고

이 기능은 실제 MVP 8개 기능에 포함되지 않는 **샘플**입니다. `sdd-framework/feature-workflow.md`
워크플로우(SPEC → API 계약/디자인 시안 병렬 → Mock+구현 초안 코드)가 실제로 동작하는지 검증하기
위해 만들었습니다. `app/`에 통합되지 않으며, 루트 `index.md`의 8개 기능 표에도 포함하지 않습니다.

## 목적

가장 일반적인 로그인 플로우 하나(이메일+비밀번호)만 다룹니다.

## 범위

- 포함: 이메일+비밀번호 로그인, 액세스·리프레시 토큰 발급
- 제외: 회원가입, OAuth(Google/Kakao) 로그인, 비밀번호 재설정 — 전부 범위 밖

## 관련 엔티티 (근거: `docs/domain/erd.md`)

`users` 테이블의 `email`, `password_hash`, `role`, `refresh_token_hash`, `deleted_at` 컬럼을
사용한다.

## 규칙

1. `email`이 존재하지 않거나 `password_hash`가 일치하지 않으면 401, "이메일 또는 비밀번호가
   올바르지 않습니다". 계정 존재 여부를 노출하지 않기 위해 두 실패를 같은 메시지로 통일한다.
2. `deleted_at`이 채워진(탈퇴) 계정은 로그인 차단 → 401 (같은 메시지)
3. `password_hash`가 NULL인 계정(소셜 로그인 전용)은 이메일 로그인을 시도하지 않는다 → 401
   (같은 메시지)
4. 로그인 성공 시 accessToken(단기), refreshToken(장기)을 발급한다. refreshToken 해시를
   `users.refresh_token_hash`에 저장(교체)한다.
5. 인증이 필요한 API는 `Authorization: Bearer <token>` 헤더로 전달한다 (근거: PRD §1.4).
