export type LoginInput = { email: string; password: string };
export type UserSummary = { id: string; name: string; role: 'CLIENT' | 'FREELANCER' };
export type LoginResponse = { accessToken: string; refreshToken: string; user: UserSummary };
export type UserRecord = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  role: 'CLIENT' | 'FREELANCER';
  refresh_token_hash: string | null;
  deleted_at: string | null;
};
