import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createAuthRouter } from './features/user-management/auth.routes';
import { AuthSessionService } from './features/user-management/auth.service';
import { createSupabaseAuthAdapter } from './features/user-management/supabase-auth.adapter';
import { MockAuthProvider } from './features/user-management/mock-auth.adapter';
import { InMemoryAuthRepository } from './features/user-management/in-memory-auth.repository';
import { authenticateMockAuthorization } from './features/user-management/auth.mock';
import type { AuthProvider } from './features/user-management/auth.port';
import type { AuthRepositories } from './features/user-management/auth.repository';
import { createRequireAuth } from './shared/require-auth';

/**
 * Express 앱 — 순수 모듈. 여기서 `app.listen()`을 호출하지 않는다.
 * 배포 진입점은 분리한다 (app/server/AGENTS.md "배포 아키텍처 — 이중 진입점"):
 *   - api/index.ts   → Vercel 서버리스
 *   - src/server.ts  → 로컬 독립 서버
 */
const app = express();

// app/web과 app/server는 Vercel 프로젝트가 분리돼 있어 배포 시 오리진이 다르다 (ADR-0007).
// 허용할 프론트 주소는 환경 변수로 받는다 (쉼표로 여러 개 가능).
// 로컬 개발은 vite proxy를 쓰므로 CORS를 타지 않는다 (app/web/vite.config.ts).
const allowedOrigins = (process.env.WEB_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  }),
);

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// 조립 지점 — 외부 벤더 어댑터를 구체 타입으로 연결하는 곳은 여기 한 곳뿐이다
// (app/server/AGENTS.md "외부 벤더 연동", ADR-0009). 기능별 라우터 등록도 여기서 한다
// (app/web의 App.tsx와 대칭).
// ---------------------------------------------------------------------------

const isProduction = process.env.NODE_ENV === 'production';
// 기본값: 배포 환경이면 supabase, 그 외(로컬 개발)는 mock. Prisma 스키마와 실제 Supabase 자격
//증명이 아직 준비되지 않았으므로(app/server/prisma/.gitkeep, features/user-management/spec.md
// "외부 계정·키 준비 상태") 현재 "supabase" 모드는 항상 fail-closed로 끝난다 — 아래 try/catch가
// 이를 흡수해 나머지 기능(/health 등)은 계속 동작하게 한다.
const authProviderMode = process.env.AUTH_PROVIDER_MODE ?? (isProduction ? 'supabase' : 'mock');

// user-management의 auth_sessions 암복호화·HMAC에 쓰는 앱 자체 대칭키다. Supabase/토스페이먼츠/
// OpenAI 같은 "벤더" 비밀이 아니라 이 서버가 스스로 만드는 키이므로 로컬 개발 fallback을 둔다.
// 배포 전에는 반드시 실제 환경 변수(32바이트 이상)로 교체해야 한다 — `.env.example`에 이름만
// 기록하고 값은 커밋하지 않는다.
function devSecret(label: string): string {
  return `pactfive-dev-only-${label}-not-for-production-use-min32bytes`;
}

let authProvider: AuthProvider | null = null;
let authRepositories: AuthRepositories | null = null;
let authWiringError: unknown = null;

try {
  if (authProviderMode === 'mock') {
    if (isProduction) throw new Error('AUTH_PROVIDER_MODE=mock은 프로덕션 환경에서 허용되지 않습니다.');
    authProvider = new MockAuthProvider();
  } else {
    // fail-closed 자리표시자 — 실제 Supabase 설정이 준비되면 이 호출이 정상 어댑터를 반환한다.
    authProvider = createSupabaseAuthAdapter();
  }
  // app/server/prisma/schema.prisma가 비어 있는 동안은(팀장 전담 영역) 두 모드 모두 인메모리
  // 저장소를 쓴다. 스키마가 채워지면 Prisma 기반 구현으로 교체한다.
  authRepositories = new InMemoryAuthRepository();
} catch (error) {
  authWiringError = error;
  console.warn(
    '[user-management] AuthProvider를 준비하지 못해 /api/v1/auth 라우트를 등록하지 않습니다:',
    error instanceof Error ? error.message : error,
  );
}

// 컨트롤러의 Origin 검증은 단일 문자열과 비교한다(auth.service.ts requireAllowedOrigin).
// CORS는 여러 오리진을 허용할 수 있지만, 이 검증은 첫 번째(주 프론트 배포) 오리진만 사용한다 —
// 배포당 웹 오리진이 하나뿐인 현재 구성에서는 문제가 없다. feedback_loop에 기록한 잠정 결정.
const primaryWebOrigin = allowedOrigins[0] ?? 'http://localhost:5174';

let authService: AuthSessionService | null = null;
if (authProvider && authRepositories) {
  authService = new AuthSessionService({
    provider: authProvider,
    repositories: authRepositories,
    sessionAbsoluteTtlMs: Number(process.env.AUTH_SESSION_ABSOLUTE_TTL_SECONDS ?? 604800) * 1000,
    refreshFingerprintKey: process.env.AUTH_REFRESH_FINGERPRINT_KEY ?? devSecret('refresh-fingerprint'),
    oauthIntentEncryptionKey: process.env.AUTH_OAUTH_INTENT_KEY ?? devSecret('oauth-intent'),
    registrationRecoveryEncryptionKey:
      process.env.AUTH_REGISTRATION_RECOVERY_KEY ?? devSecret('registration-recovery'),
    oauthCallbackUrl: process.env.AUTH_OAUTH_CALLBACK_URL ?? 'http://localhost:3000/api/v1/auth/oauth-callbacks',
  });
  app.use(createAuthRouter(authService, primaryWebOrigin));
}

// 다른 기능(contracts-payments 등)이 "인증된 사용자 + 본인 소유 리소스" 검사에 쓰는 공용
// 미들웨어. 실제 검증은 authService(있으면)에 위임하고, mock 모드에서는 고정 토큰만 허용한다.
export const requireAuth = createRequireAuth(async (accessToken) => {
  if (authProviderMode === 'mock') {
    return authenticateMockAuthorization(`Bearer ${accessToken}`, 'mock');
  }
  if (!authService) throw authWiringError instanceof Error ? authWiringError : new Error('AUTH_PROVIDER_NOT_READY');
  const context = await authService.getCurrentContext(accessToken);
  return { userId: context.userId, role: context.role };
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
