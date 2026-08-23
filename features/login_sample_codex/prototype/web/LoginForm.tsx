import { useState } from 'react';
import { useAuth } from './useAuth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, error } = useAuth();

  return (
    <form onSubmit={(e) => { e.preventDefault(); login(email, password); }}>
      <input placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="비밀번호" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <span>{error}</span>}
      <button type="submit">로그인</button>
    </form>
  );
}
