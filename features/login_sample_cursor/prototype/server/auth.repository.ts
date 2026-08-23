import type { UserRecord } from './auth.types';

export async function findUserByEmail(_email: string): Promise<UserRecord | null> {
  throw new Error('not implemented');
}

export async function saveRefreshTokenHash(_userId: string, _hash: string): Promise<void> {
  throw new Error('not implemented');
}
