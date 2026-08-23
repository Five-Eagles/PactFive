import { useState } from 'react';
import { loginRequest } from './api/auth';

export function useAuth() {
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string) {
    try {
      await loginRequest({ email, password });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    }
  }

  return { login, error };
}
