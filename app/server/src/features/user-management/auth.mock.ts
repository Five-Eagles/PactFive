import type { UserRole } from "./auth.types";

export const MOCK_CLIENT_AUTHORIZATION = "Bearer pactfive-mock-client-01";
export const MOCK_FREELANCER_AUTHORIZATION = "Bearer pactfive-mock-freelancer-01";

export type MockRuntime = "test" | "mock" | "development" | "preview" | "production";

export type MockBearerContext = {
  userId: string;
  role: UserRole;
};

export function authenticateMockAuthorization(
  authorization: string | undefined,
  runtime: MockRuntime,
  audit: (event: { code: string }) => void = () => undefined,
): MockBearerContext {
  if (runtime !== "test" && runtime !== "mock") {
    audit({ code: "MOCK_AUTH_DISABLED" });
    throw new Error("401 AUTH_REQUIRED");
  }

  if (authorization === MOCK_CLIENT_AUTHORIZATION) {
    audit({ code: "MOCK_AUTH_ACCEPTED_CLIENT" });
    return { userId: "usr_00000000000000000000000001", role: "CLIENT" };
  }
  if (authorization === MOCK_FREELANCER_AUTHORIZATION) {
    audit({ code: "MOCK_AUTH_ACCEPTED_FREELANCER" });
    return { userId: "usr_00000000000000000000000002", role: "FREELANCER" };
  }

  audit({ code: "MOCK_AUTH_REJECTED" });
  throw new Error("401 AUTH_REQUIRED");
}
