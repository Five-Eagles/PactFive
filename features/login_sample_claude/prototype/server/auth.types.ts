export type LoginInput = { email: string; password: string };
export type UserSummary = { id: string; name: string; role: 'CLIENT' | 'FREELANCER' };
export type LoginResponse = { accessToken: string; refreshToken: string; user: UserSummary };

// users 엔티티 부분 (docs/domain/erd.md 근거) — 로그인에 필요한 컬럼만
export type UserRecord = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  role: 'CLIENT' | 'FREELANCER';
  refresh_token_hash: string | null;
  deleted_at: string | null;
};
