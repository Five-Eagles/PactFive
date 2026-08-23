import { useState } from "react";
import { login as loginApi } from "./api/auth";
import type { LoginInput, LoginResponse } from "../server/auth.types";

export function useAuth() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<LoginResponse["user"] | null>(null);

  const handleLogin = async (input: LoginInput): Promise<LoginResponse> => {
    setIsSubmitting(true);
    try {
      const result = await loginApi(input);
      setUser(result.user);
      return result;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { user, isSubmitting, handleLogin };
}
