import type { LoginInput, LoginResponse } from './auth.types';
import { findUserByEmail, saveRefreshTokenHash } from './auth.repository';

export class UnauthorizedError extends Error {}

const MSG = '이메일 또는 비밀번호가 올바르지 않습니다';

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await findUserByEmail(input.email);
  // spec.md 규칙 1~2: 계정 없음/비밀번호 불일치/탈퇴 계정 → 401
  if (!user || user.deleted_at) throw new UnauthorizedError(MSG);
  if (user.password_hash !== `hashed:${input.password}`) throw new UnauthorizedError(MSG);

  const accessToken = `access_${Date.now()}`;
  const refreshToken = `refresh_${Date.now()}`;
  await saveRefreshTokenHash(user.id, `hashed:${refreshToken}`);

  return { accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role } };
}
