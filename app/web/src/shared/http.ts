/**
 * 공용 HTTP 클라이언트 — app/web에서 서버를 부르는 유일한 통로.
 *
 * 각 기능의 `api/{도메인}.ts`는 반드시 이 파일을 거친다. `fetch`/`axios`를 직접 부르지 않는다
 * (app/web/AGENTS.md "폴더 간 접점" 참고). 이 파일 하나가 아래 4가지를 책임진다.
 *
 *   1. base URL 결정          — VITE_API_BASE_URL (비어 있으면 /api → vite proxy)
 *   2. 인증 헤더 주입          — 토큰을 어디서 가져올지는 이 파일이 모른다 (아래 참고)
 *   3. 공통 에러 처리          — 401 훅, 그 외는 ApiError로 변환
 *   4. 요청/응답 JSON 직렬화
 *
 * 벤더(Supabase) SDK를 여기서 import하지 않는다. 토큰 공급자는 앱 시작 시
 * `setAuthTokenProvider()`로 주입받는다 — 인증 방식이 바뀌어도 이 파일은 그대로다
 * (ADR-0009의 port/adapter 원칙과 같은 취지).
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/** 서버가 4xx/5xx를 돌려줬을 때 던지는 에러. 화면단은 status(또는 code)로 분기한다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
    /** 서버 오류 코드(`error.code`) — 있으면 화면단이 status보다 이 값으로 분기하는 걸 우선한다. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenProvider = () => string | null | Promise<string | null>;

let getAuthToken: TokenProvider = () => null;
let onUnauthorized: (() => void) | null = null;

/**
 * 인증 토큰을 어떻게 얻을지 앱 시작 시 한 번 주입한다.
 * 예: `setAuthTokenProvider(() => supabase.auth.getSession().then(s => s.data.session?.access_token ?? null))`
 */
export function setAuthTokenProvider(provider: TokenProvider): void {
  getAuthToken = provider;
}

/**
 * 401을 받았을 때 할 일을 앱 시작 시 한 번 주입한다 (보통 로그인 화면으로 이동).
 * 이 파일이 라우터를 직접 import하지 않기 위한 장치다.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

type RequestOptions = {
  /** 쿼리스트링. undefined·null 값은 자동으로 빠진다. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 인증 헤더를 붙이지 않는다 (로그인·회원가입 등 공개 엔드포인트). */
  skipAuth?: boolean;
  /**
   * `setAuthTokenProvider`가 아직 최신값을 모를 수 있는 상황(예: 방금 refresh로 받은 토큰으로
   * 바로 다음 요청을 보내야 하는 세션 복원 흐름)을 위한 명시적 토큰 override.
   * 지정하면 provider 호출을 건너뛰고 이 값을 그대로 쓴다.
   */
  authToken?: string;
  /**
   * 401을 받아도 `setUnauthorizedHandler`로 등록된 처리(보통 로그인 화면으로 이동)를
   * 실행하지 않는다. `ApiError`는 그대로 던지므로 호출부가 직접 판단한다.
   *
   * **세션 복원 요청에만 쓴다.** 앱이 뜰 때 "로그인 상태가 남아 있나" 물어보는 호출은,
   * 실패해도 그건 "로그인한 적이 없다"는 정상적인 답이다. 이걸 만료로 취급해 로그인 화면으로
   * 보내면 무한 리로드가 된다 — 이동 → 앱 재마운트 → 다시 복원 시도 → 401 → 이동.
   * 공개 화면(프로젝트 탐색·상세)을 비로그인이 못 보게 되는 문제도 함께 생긴다.
   *
   * 사용자가 명시적으로 요청한 보호 API가 401을 받는 경우(진짜 만료)에는 이 옵션을 쓰지 않는다.
   */
  skipUnauthorizedHandler?: boolean;
  signal?: AbortSignal;
  /**
   * 요청별 추가 헤더 (2026-09-04, ai-pricing 통합에서 추가 — 클라이언트가 직접 발급하는
   * `Idempotency-Key`가 필요했다. 기존 기능들은 멱등키를 서버가 리소스 ID에서 유도해 헤더가
   * 필요 없었다). `Content-Type`·`Authorization`은 이 파일이 이미 관리하므로 여기서 덮어써도
   * 무시된다.
   */
  headers?: Record<string, string>;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  } else if (!options.skipAuth) {
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
    // app/web·app/server는 Vercel 프로젝트가 분리돼 배포 시 서로 다른 오리진이다(ADR-0007).
    // user-management의 Refresh Token은 HttpOnly 쿠키로만 전달되므로(app/server/AGENTS.md
    // "외부 벤더 연동" · features/user-management/api-contract.md) 크로스 오리진에서도 쿠키가
    // 실리도록 항상 포함한다. 로컬 개발은 vite proxy로 동일 오리진이 되어 영향이 없다.
    credentials: 'include',
  });

  if (response.status === 401) {
    if (!options.skipUnauthorizedHandler) onUnauthorized?.();
    const payload = await parseBody(response);
    throw new ApiError(401, extractMessage(payload, '인증이 필요합니다.'), payload, extractCode(payload));
  }

  // 204 No Content 등 본문이 없는 응답
  if (response.status === 204) return undefined as T;

  const payload = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response.statusText), payload, extractCode(payload));
  }

  return payload as T;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? safeJsonParse(text) : undefined;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * 에러 메시지를 두 형식에서 찾는다.
 *   1. `{ error: { code, message, details } }` — 표준 계약(user-management api-contract.md 등)
 *   2. `{ message }` — 초기 스캐폴드(sample-login류)의 단순 형식과의 하위 호환
 */
function extractMessage(payload: unknown, fallback: string): string {
  const nested = extractErrorObject(payload)?.message;
  if (typeof nested === 'string') return nested;
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function extractCode(payload: unknown): string | undefined {
  const code = extractErrorObject(payload)?.code;
  return typeof code === 'string' ? code : undefined;
}

function extractErrorObject(payload: unknown): { code?: unknown; message?: unknown } | undefined {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error: unknown }).error;
    if (error && typeof error === 'object') return error as { code?: unknown; message?: unknown };
  }
  return undefined;
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>('DELETE', path, undefined, options),
};
