import type { UserRecord } from "./auth.types";

// 실제 구현에서는 Prisma client를 사용한다. 이 파일은 계층 구조(controller/service/repository)
// 패턴을 보여주기 위한 구현 초안이며, 팀장 통합 시 app/server/prisma/의 실제 스키마에 맞게
// 다시 구현된다 (sdd-framework/integration-workflow.md).

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  // SELECT * FROM users WHERE email = $1
  throw new Error("prototype only — not implemented");
}

export async function updateRefreshTokenHash(userId: string, refreshTokenHash: string): Promise<void> {
  // UPDATE users SET refresh_token_hash = $2 WHERE id = $1
  throw new Error("prototype only — not implemented");
}
