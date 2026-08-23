import { findUserByEmail, updateRefreshTokenHash } from "./auth.repository";
import type { LoginInput, LoginResponse } from "./auth.types";

// 실제 구현에서는 bcrypt.compare, jwt.sign 등을 사용한다. 여기서는 판단 로직의 형태만 보여준다.
async function isPasswordCorrect(inputPassword: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) return false; // 소셜 전용 계정 (spec.md 규칙 3)
  return true; // prototype only — 실제로는 bcrypt.compare(inputPassword, passwordHash)
}

function signAccessToken(userId: string, role: string): string {
  return `mock-access-token-for-${userId}`; // 실제로는 JWT_ACCESS_SECRET으로 서명
}

function signRefreshToken(userId: string): string {
  return `mock-refresh-token-for-${userId}`; // 실제로는 JWT_REFRESH_SECRET으로 서명
}

function hashToken(token: string): string {
  return `hashed-${token}`; // 실제로는 별도 해시 함수
}

export class UnauthorizedError extends Error {}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const user = await findUserByEmail(input.email);

  // 계정 존재 여부를 노출하지 않기 위해 세 실패 케이스를 같은 에러로 통일한다 (spec.md 규칙 1~3)
  const hasDeletedAccount = !!user?.deletedAt;
  const passwordOk = !!user && !hasDeletedAccount && (await isPasswordCorrect(input.password, user.passwordHash));

  if (!user || hasDeletedAccount || !passwordOk) {
    throw new UnauthorizedError("이메일 또는 비밀번호가 올바르지 않습니다");
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id);
  await updateRefreshTokenHash(user.id, hashToken(refreshToken));

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, role: user.role },
  };
}
