import type { LoginInput, LoginResponse } from "../server/auth.types";

// Mock — api-contract.md 계약대로 동작하는 가짜 서버. app/web/mocks/ 방식과 동일하게, 백엔드
// 없이 프론트를 개발할 때 이 함수를 fetch 대신 붙여 쓴다.
//
// spec.md 규칙 1~4를 각각 최소 1개 테스트로 확인할 수 있도록, 상태가 다른 계정 3개를 미리
// 준비해둔다 (정상 / 탈퇴 / 소셜 전용). run.tsx가 이 셋을 각각 호출해서 검증한다.

type MockAccount = {
  password: string | null; // null이면 소셜 전용(비밀번호 로그인 불가)
  deleted: boolean;
  user: LoginResponse["user"];
};

const MOCK_ACCOUNTS: Record<string, MockAccount> = {
  "test@pactfive.com": {
    password: "password123",
    deleted: false,
    user: { id: "usr_mock0001", name: "테스트 사용자", role: "CLIENT" },
  },
  "withdrawn@pactfive.com": {
    password: "password123",
    deleted: true, // spec.md 규칙 2
    user: { id: "usr_mock0002", name: "탈퇴 사용자", role: "CLIENT" },
  },
  "social@pactfive.com": {
    password: null, // spec.md 규칙 3 — 소셜 로그인 전용, password_hash가 NULL인 계정
    deleted: false,
    user: { id: "usr_mock0003", name: "소셜 전용 사용자", role: "FREELANCER" },
  },
};

const GENERIC_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다";

export async function mockLogin(input: LoginInput): Promise<LoginResponse> {
  const account = MOCK_ACCOUNTS[input.email];
  // 규칙 1(계정 없음/비밀번호 불일치), 2(탈퇴), 3(소셜 전용) 전부 같은 메시지로 401 처리한다 —
  // 계정 존재 여부·탈퇴 여부·소셜 전용 여부를 메시지로 노출하지 않기 위함.
  if (!account || account.deleted || account.password === null || account.password !== input.password) {
    throw new Error(`401: ${GENERIC_MESSAGE}`);
  }
  return {
    accessToken: "mock-access-token", // spec.md 규칙 4
    refreshToken: "mock-refresh-token",
    user: account.user,
  };
}
