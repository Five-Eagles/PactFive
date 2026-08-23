import type { LoginInput, LoginResponse, UserRecord } from '../server/auth.types';

const MSG = '이메일 또는 비밀번호가 올바르지 않습니다';

const USERS: Record<string, UserRecord> = {
  'test@pactfive.com': {
    id: 'usr_mock0001', email: 'test@pactfive.com', password_hash: 'hashed:password123',
    name: '테스트 사용자', role: 'CLIENT', refresh_token_hash: null, deleted_at: null,
  },
};

export async function mockLogin(input: LoginInput): Promise<LoginResponse> {
  const user = USERS[input.email];
  if (!user || user.deleted_at || user.password_hash !== `hashed:${input.password}`) {
    throw new Error(`401: ${MSG}`);
  }
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: { id: user.id, name: user.name, role: user.role },
  };
}
