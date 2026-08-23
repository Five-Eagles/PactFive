import type { LoginInput, LoginResponse } from '../../server/auth.types';

export async function loginRequest(input: LoginInput): Promise<LoginResponse> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.message);
  }
  return res.json();
}
