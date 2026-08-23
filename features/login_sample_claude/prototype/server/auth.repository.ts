import type { UserRecord } from './auth.types';

// 구현 초안 — 실제 DB 연결 전까지는 미구현. 통합 단계(sdd-framework/integration-workflow.md)에서
// Prisma 등으로 교체된다. Mock은 별도로 prototype/mock/auth.mock.ts에 있다.
export async function findUserByEmail(_email: string): Promise<UserRecord | null> {
  throw new Error('not implemented — see prototype/mock/auth.mock.ts for prototype behavior');
}

export async function saveRefreshTokenHash(_userId: string, _hash: string): Promise<void> {
  throw new Error('not implemented — see prototype/mock/auth.mock.ts for prototype behavior');
}
