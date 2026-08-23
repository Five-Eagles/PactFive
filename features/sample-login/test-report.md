# sample-login 테스트 결과

담당자: 팀장 (이 폴더는 워크플로우 검증용 예시 — `sdd-framework/feature-workflow.md` 참고)
테스트 날짜: 2026-08-21
테스트한 커밋: (샘플 예시라 실제 커밋 해시 없음 — pactfive-repo-structure-v29.zip 기준)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 6, FAIL 개수: 0)

## spec.md 규칙별 확인

`spec.md`에는 규칙이 5개 있다. 규칙 5(Authorization 헤더)는 로그인 자체의 입출력이 아니라
"로그인 이후 다른 API를 어떻게 호출하는가"에 대한 설명이라, 이 Mock으로는 검증 대상이 아니다
(로그인 성공 시 토큰이 실제로 발급되는지는 규칙 4가 이미 확인한다). 나머지 4개는 전부 확인했다.

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 (계정 없음/비밀번호 불일치 → 401, 동일 메시지) | `run.tsx`의 "잘못된 비밀번호 거부됨" 테스트 | 통과 |
| 2 (탈퇴 계정 → 401, 동일 메시지) | `run.tsx`의 "탈퇴 계정 거부됨" 테스트 | 통과 |
| 3 (소셜 전용 계정 → 401, 동일 메시지) | `run.tsx`의 "소셜 전용 계정 거부됨" 테스트 | 통과 |
| 4 (성공 시 accessToken·refreshToken 발급) | `run.tsx`의 "정상 로그인" 테스트 | 통과 |
| 5 (Authorization: Bearer 헤더 사용) | 이 기능(로그인) 자체의 검증 대상 아님 — 로그인 이후 다른 API의 규칙 | 안 함 (해당 없음) |

## 아직 안 되는 것 (Known Issues)

- `prototype/server/`는 구현 초안 코드일 뿐 실제 DB에 연결돼 있지 않다 (의도된 상태 — ADR-0006).
  `auth.repository.ts`는 호출하면 "not implemented" 에러를 던진다.
- 비밀번호 해시 비교(`checkPassword`)가 실제 bcrypt 등이 아니라 문자열 비교 자리표시자다.
  통합 단계에서 팀장이 실제 구현으로 교체한다.

## 팀장에게 물어봐야 하는 것

- 없음 (이 폴더 자체가 팀장이 만든 예시)
