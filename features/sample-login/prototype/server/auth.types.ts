export type LoginInput = {
  email: string;
  password: string;
};

export type UserSummary = {
  id: string;
  name: string;
  role: "CLIENT" | "FREELANCER";
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserSummary;
};

// repository가 돌려주는 내부 레코드 — API 응답에는 그대로 노출하지 않는다
export type UserRecord = UserSummary & {
  passwordHash: string | null;
  deletedAt: Date | null;
};
