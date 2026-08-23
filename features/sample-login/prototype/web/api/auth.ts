import type { LoginInput, LoginResponse } from "../../server/auth.types";

export async function login(input: LoginInput): Promise<LoginResponse> {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
  }
  return res.json();
}
