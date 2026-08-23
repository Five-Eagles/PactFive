import type { LoginInput, LoginResponse, UserRecord } from '../server/auth.types';

const GENERIC_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다';

// spec.md 규칙 1~3을 전부 검증할 수 있도록 4가지 계정 상태를 미리 준비한다.
const USERS: Record<string, UserRecord> = {
  'test@pactfive.com': {
    id: 'usr_mock0001', email: 'test@pactfive.com', password_hash: 'hashed:password123',
    name: '테스트 사용자', role: 'CLIENT', refresh_token_hash: null, deleted_at: null,
  },
  'withdrawn@pactfive.com': {
    id: 'usr_mock0002', email: 'withdrawn@pactfive.com', password_hash: 'hashed:password123',
    name: '탈퇴 사용자', role: 'CLIENT', refresh_token_hash: null, deleted_at: '2026-01-01T00:00:00Z',
  },
  'social@pactfive.com': {
    id: 'usr_mock0003', email: 'social@pactfive.com', password_hash: null,
    name: '소셜 전용 사용자', role: 'FREELANCER', refresh_token_hash: null, deleted_at: null,
  },
};

export async function mockLogin(input: LoginInput): Promise<LoginResponse> {
  const user = USERS[input.email];
  if (!user || user.deleted_at || !user.password_hash || user.password_hash !== `hashed:${input.password}`) {
    throw new Error(`401: ${GENERIC_MESSAGE}`);
  }
  return {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: { id: user.id, name: user.name, role: user.role },
  };
}
