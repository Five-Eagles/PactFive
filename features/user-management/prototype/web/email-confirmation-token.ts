export type EmailConfirmationFragmentResult =
  | { status: "ready"; tokenHash: string }
  | { status: "invalid"; tokenHash: null };

export type EmailConfirmationFragmentSource = {
  hash: string;
  pathname: string;
  search: string;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
};

const SENSITIVE_CONFIRMATION_QUERY_KEYS = ["tokenHash", "token_hash"] as const;

/**
 * 확인 값은 fragment만 정식 입력으로 사용한다. 잘못 만들어진 링크나 공격자가 붙인 token 계열
 * query도 주소·referrer·서버 로그에 남지 않도록 정식 returnTo 이외의 query는 보존하되 제거한다.
 */
export function removeSensitiveConfirmationQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of SENSITIVE_CONFIRMATION_QUERY_KEYS) params.delete(key);
  const sanitized = params.toString();
  return sanitized ? `?${sanitized}` : "";
}

/**
 * Supabase 메일 템플릿이 만든 fragment에서 일회용 token hash만 읽는다.
 * 공급자 type은 서버가 email로 고정하므로 URL의 임의 type은 신뢰하지 않는다.
 */
export function parseEmailConfirmationFragment(hash: string): EmailConfirmationFragmentResult {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  const tokenHash = params.get("tokenHash");
  if (!tokenHash || tokenHash.trim().length < 8) return { status: "invalid", tokenHash: null };
  return { status: "ready", tokenHash };
}

/**
 * token hash를 메모리로 옮긴 직후 주소에서 제거한다. 브라우저 저장소·로그·분석 도구에는 쓰지 않는다.
 */
export function consumeEmailConfirmationFragment(input: {
  hash: EmailConfirmationFragmentSource["hash"];
  pathname: EmailConfirmationFragmentSource["pathname"];
  search: EmailConfirmationFragmentSource["search"];
  replaceState: EmailConfirmationFragmentSource["replaceState"];
}): EmailConfirmationFragmentResult {
  const result = parseEmailConfirmationFragment(input.hash);
  const sanitizedSearch = removeSensitiveConfirmationQuery(input.search);
  if (input.hash || sanitizedSearch !== input.search) {
    input.replaceState(null, "", `${input.pathname}${sanitizedSearch}`);
  }
  return result;
}

/**
 * React를 import/render하기 전에 한 번만 호출할 fragment 캡처 함수를 만든다.
 *
 * 같은 함수가 개발 모드 초기화나 StrictMode 경로에서 다시 호출돼도 두 번째 URL을 읽거나
 * history를 다시 쓰지 않는다. query string은 token 입력으로 읽지 않고 주소를 정리할 때 그대로
 * 보존한다. 반환값은 호출자가 메모리에서만 들고 EmailConfirmationPage에 전달해야 한다.
 */
export function createEmailConfirmationFragmentCapture(): (
  input: EmailConfirmationFragmentSource,
) => EmailConfirmationFragmentResult {
  let captured = false;
  let result: EmailConfirmationFragmentResult = { status: "invalid", tokenHash: null };

  return (input) => {
    if (captured) return result;
    const next = consumeEmailConfirmationFragment(input);
    result = next;
    captured = true;
    return result;
  };
}
