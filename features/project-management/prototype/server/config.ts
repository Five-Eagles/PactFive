/**
 * 환경 변수에서 설정을 읽는다
 *
 * 팀 요구사항(2026-09-01) — 키를 코드에 박지 않고 **프로젝트 루트 `.env`** 에서
 * 주입받는다. 이 도메인은 외부 벤더를 부르지 않지만, 서버 간 인증에 쓰는
 * 공유 비밀값이 있어 같은 규칙을 적용한다.
 *
 * ## 없을 때 어떻게 하는가
 *
 * **개발 기본값을 조용히 쓰지 않는다.** 조용히 넘어가면 운영에서 개발용 토큰이
 * 그대로 돌아간다 — 그 순간 아무나 `/internal/v1` 을 부를 수 있다.
 *
 * | 언제 | 없으면 |
 * |---|---|
 * | 개발 (`NODE_ENV !== "production"`) | 개발 기본값을 쓰되 **경고를 한 번 남긴다** |
 * | 운영 | **즉시 실패한다.** 서버가 뜨지 않는 편이 낫다 |
 *
 * 뜨고 나서 요청마다 401 을 뱉는 것보다, 뜨지 않아서 배포가 멈추는 쪽이 빨리 발견된다.
 */

/** 개발 기본값. 운영에서는 절대 쓰이지 않는다 */
const DEV_DEFAULTS = {
  INTERNAL_SERVICE_TOKEN: "mock-internal-service-token",
} as const;

export type EnvSource = Record<string, string | undefined>;

/** 같은 키로 두 번 경고하지 않는다 */
const warned = new Set<string>();

export class MissingEnvError extends Error {
  constructor(readonly key: string) {
    super(
      `환경 변수 ${key} 가 없습니다. 프로젝트 루트 .env 에 추가해 주십시오. ` +
        `(.env.example 참고)`,
    );
    this.name = "MissingEnvError";
  }
}

function readRequired(
  env: EnvSource,
  key: keyof typeof DEV_DEFAULTS,
  isProduction: boolean,
  onWarn: (message: string) => void,
): string {
  const value = env[key];
  if (value) return value;

  if (isProduction) throw new MissingEnvError(key);

  if (!warned.has(key)) {
    warned.add(key);
    onWarn(
      `[config] ${key} 가 없어 개발 기본값을 씁니다. 운영에서는 서버가 뜨지 않습니다.`,
    );
  }
  return DEV_DEFAULTS[key];
}

export type ProjectManagementConfig = {
  /**
   * 서버 간 호출에 붙는다. 사용자 로그인 토큰으로는 `/internal/v1` 에 접근할 수 없다
   * (spec.md 규칙 49).
   */
  internalServiceToken: string;
};

export function loadConfig(
  env: EnvSource = process.env,
  onWarn: (message: string) => void = console.warn,
): ProjectManagementConfig {
  const isProduction = env.NODE_ENV === "production";
  return {
    internalServiceToken: readRequired(env, "INTERNAL_SERVICE_TOKEN", isProduction, onWarn),
  };
}

/** 테스트에서 경고 상태를 초기화한다 */
export function resetConfigWarnings(): void {
  warned.clear();
}

/**
 * 개발용 로그인 토큰 2종 (규칙 54 · 오민혁 확정).
 *
 * **개발 기본값을 여기 그대로 둔다.** 비밀값이 아니라 "이 값이면 이 사용자"라는
 * 약속이고, 팀 전체가 같은 값을 써야 붙여볼 수 있다.
 * 실제 인증이 붙으면 이 표는 통째로 사라진다 — `.env` 로 옮길 대상이 아니다.
 */
export const MOCK_LOGIN_TOKENS = {
  "pactfive-mock-client-01": { userId: "usr_00000000000000000000000001", role: "CLIENT" },
  "pactfive-mock-freelancer-01": { userId: "usr_00000000000000000000000002", role: "FREELANCER" },
} as const;
