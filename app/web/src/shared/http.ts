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

/** 서버가 4xx/5xx를 돌려줬을 때 던지는 에러. 화면단은 status로 분기한다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
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
  signal?: AbortSignal;
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
  const headers: Record<string, string> = {};

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!options.skipAuth) {
    const token = await getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  });

  if (response.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, '인증이 필요합니다.');
  }

  // 204 No Content 등 본문이 없는 응답
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(payload, response.statusText), payload);
  }

  return payload as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
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
