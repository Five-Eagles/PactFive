# login_sample_codex — API 계약

## POST /auth/login

요청: `{ "email": string, "password": string }`

응답 200:
```json
{ "accessToken": "string", "refreshToken": "string", "user": { "id": "string", "name": "string", "role": "CLIENT" } }
```

에러: 401 (이메일/비밀번호 불일치, 탈퇴 계정) — "이메일 또는 비밀번호가 올바르지 않습니다"

## DTO

```ts
type LoginInput = { email: string; password: string };
type UserSummary = { id: string; name: string; role: 'CLIENT' | 'FREELANCER' };
type LoginResponse = { accessToken: string; refreshToken: string; user: UserSummary };
```
