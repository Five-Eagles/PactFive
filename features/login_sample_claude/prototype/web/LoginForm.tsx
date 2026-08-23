import { useState } from 'react';
import { useAuth } from './useAuth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error, isSubmitting } = useAuth();

  return (
    <form onSubmit={(e) => { e.preventDefault(); login(email, password); }}>
      <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={isSubmitting}>로그인</button>
    </form>
  );
}
