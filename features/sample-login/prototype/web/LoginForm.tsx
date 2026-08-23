import { useState } from "react";
import { useAuth } from "./useAuth";

type LoginFormProps = {
  onSuccess?: () => void;
};

// design/low-fi.md의 필드 구성을 그대로 따른다. 실제 컴포넌트는 design-system 확정 후
// high-fi로 다시 만든다.
export function LoginForm({ onSuccess }: LoginFormProps) {
  const { isSubmitting, handleLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    try {
      await handleLogin({ email, password });
      onSuccess?.();
    } catch {
      setErrorMessage("이메일 또는 비밀번호가 올바르지 않습니다");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" />
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <button type="submit" disabled={isSubmitting}>로그인</button>
    </form>
  );
}
