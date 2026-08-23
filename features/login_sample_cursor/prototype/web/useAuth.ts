import { useState } from 'react';
import { loginRequest } from './api/auth';

export function useAuth() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function login(email: string, password: string) {
    setIsSubmitting(true);
    setError(null);
    try {
      await loginRequest({ email, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsSubmitting(false);
    }
  }

  return { login, error, isSubmitting };
}
