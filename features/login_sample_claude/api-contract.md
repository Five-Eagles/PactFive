# login_sample_claude — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다.

## POST /auth/login

요청:

```json
{ "email": "user@example.com", "password": "string" }
```

응답 200:

```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": { "id": "usr_...", "name": "string", "role": "CLIENT" }
}
```

에러:

| 상태 | 조건 | 메시지 |
|---|---|---|
| 401 | 계정 없음 / 비밀번호 불일치 / 탈퇴 계정 / 소셜 전용 계정 (spec.md 규칙 1~3, 4가지 모두 동일 메시지) | "이메일 또는 비밀번호가 올바르지 않습니다" |

## DTO

```ts
type LoginInput = { email: string; password: string };
type UserSummary = { id: string; name: string; role: 'CLIENT' | 'FREELANCER' };
type LoginResponse = { accessToken: string; refreshToken: string; user: UserSummary };
```
