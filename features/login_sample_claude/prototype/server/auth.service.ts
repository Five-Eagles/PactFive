import type { LoginInput, LoginResponse, UserRecord } from './auth.types';
import { findUserByEmail, saveRefreshTokenHash } from './auth.repository';

export class UnauthorizedError extends Error {}

const GENERIC_MESSAGE = '이메일 또는 비밀번호가 올바르지 않습니다';

// spec.md 규칙 1~3 — 세 가지 실패 사유를 전부 같은 메시지로 통일한다. 계정 존재 여부, 탈퇴 여부,
// 소셜 전용 여부 중 어떤 것도 메시지로 드러나면 안 된다.
function verifyLoginable(user: UserRecord | null, password: string): asserts user is UserRecord {
  if (!user) throw new UnauthorizedError(GENERIC_MESSAGE); // 규칙 1: 계정 없음
  if (user.deleted_at) throw new UnauthorizedError(GENERIC_MESSAGE); // 규칙 2: 탈퇴 계정
  if (!user.password_hash) throw new UnauthorizedError(GENERIC_MESSAGE); // 규칙 3: 소셜 전용 계정
  if (!checkPassword(password, user.password_hash)) throw new UnauthorizedError(GENERIC_MESSAGE); // 규칙 1: 불일치
}

function checkPassword(plain: string, hash: string): boolean {
  // 구현 초안 — 실제 해시 비교(bcrypt 등)는 통합 단계에서 확정
  return `hashed:${plain}` === hash;
}

function issueTokens(): { accessToken: string; refreshToken: string } {
  return { accessToken: `access_${Date.now()}`, refreshToken: `refresh_${Date.now()}` };
}

function hashToken(token: string): string {
  return `hashed:${token}`;
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await findUserByEmail(input.email);
  verifyLoginable(user, input.password);

  const { accessToken, refreshToken } = issueTokens();
  await saveRefreshTokenHash(user.id, hashToken(refreshToken)); // spec.md 규칙 4

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, role: user.role },
  };
}
