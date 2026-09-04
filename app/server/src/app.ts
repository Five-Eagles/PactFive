import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
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
import { createOptionalAuth } from './shared/optional-auth';
import { createRequireServiceToken } from './shared/require-service-token';
import { createProjectManagementRouter } from './features/project-management/project.routes';
import { createProjectService } from './features/project-management/project.service';
import { createProjectContractService } from './features/project-management/project-contract.service';
import { createProjectReadService } from './features/project-management/project-read.service';
import { InMemoryProjectRepository } from './features/project-management/in-memory-project.repository';
import { createInMemoryExternalPorts } from './features/project-management/in-memory-external.adapter';
import { createEngagementRouter } from './features/engagement/bookmark.routes';
import { createEngagementService } from './features/engagement/bookmark.service';
import { InMemoryBookmarkRepository } from './features/engagement/in-memory-bookmark.repository';
import { InMemoryProjectTransactionCallLogRepository } from './features/contracts-payments/in-memory-project-transaction-call-log.repository';
import { createProjectManagementAdapter } from './features/contracts-payments/project-management.adapter';
import { InMemoryContractsPaymentsRepository } from './features/contracts-payments/in-memory-contracts-payments.repository';
import { createPublicApiService } from './features/contracts-payments/public-api.service';
import { createPublicApiRouter } from './features/contracts-payments/public-api.routes';
import { hasPgSecretKey, createTossPaymentsAdapter } from './features/contracts-payments/toss-payments.adapter';
import type { PaymentGateway } from './features/contracts-payments/payment.port';

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
// 기본값: 배포 환경이면 supabase, 그 외(로컬 개발)는 mock.
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
    // 2026-08-28 통합: 담당자가 실제 Supabase 어댑터를 완성해 자리표시자를 교체했다.
    // 설정이 하나라도 비면 어댑터 쪽에서 예외를 던진다(fail-closed) — 아래 catch가 흡수해
    // /api/v1/auth 라우트만 등록하지 않고 나머지 기능은 계속 동작한다.
    // SUPABASE_SERVICE_ROLE_KEY는 서버 전용 비밀값이다 — `VITE_`를 붙이지 않는다.
    authProvider = createSupabaseAuthAdapter({
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      publishableKey: process.env.SUPABASE_ANON_KEY ?? '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      emailConfirmationRedirectTo:
        process.env.AUTH_EMAIL_CONFIRMATION_REDIRECT_URL ?? `${allowedOrigins[0] ?? ''}/auth/confirm`,
    });
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

// 컨트롤러의 Origin 검증(auth.service.ts requireAllowedOrigin)은 2026-08-28 통합에서 목록을
// 받도록 넓어졌다 — CORS 허용 목록을 그대로 넘긴다. 이전 반영의 "첫 오리진만 검증" 잠정 처리는
// 해소됐다 (feedback_loop/2026-08-28/user-management.md 항목 1).
const originsForAuth = allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:5174'];

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
  app.use(createAuthRouter(authService, originsForAuth));
}

/** 새 식별자. Prisma 도입 후에는 DB가 만든다. */
function randomId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * 토큰 검증으로 알게 된 역할을 기억해 둔다.
 *
 * engagement의 `UserReadPort.getUserRole(userId)`가 필요로 하는데, user-management가 아직
 * "userId로 역할 조회" 함수를 노출하지 않았다. 토큰 검증은 이미 역할을 돌려주므로 그 값을
 * 여기 담아 두고 포트가 읽어 간다.
 *
 * **서버리스에서는 인스턴스마다 비어 있다** — 콜드 스타트 직후 첫 요청은 이 Map이 채워진 뒤
 * 서비스가 읽으므로 문제가 없지만, 이것은 캐시일 뿐 정본이 아니다. user-management가 조회
 * 함수를 내놓으면 이 Map을 지우고 그 함수를 부른다
 * (feedback_loop/2026-08-28/engagement.md 항목 1).
 */
const roleByUserId = new Map<string, 'CLIENT' | 'FREELANCER'>();

// 다른 기능이 "인증된 사용자 + 본인 소유 리소스" 검사에 쓰는 공용 미들웨어. 실제 검증은
// authService(있으면)에 위임하고, mock 모드에서는 고정 토큰만 허용한다.
const verifyAccessToken = async (accessToken: string) => {
  const verified =
    authProviderMode === 'mock'
      ? authenticateMockAuthorization(`Bearer ${accessToken}`, 'mock')
      : await (async () => {
          if (!authService) {
            throw authWiringError instanceof Error
              ? authWiringError
              : new Error('AUTH_PROVIDER_NOT_READY');
          }
          const context = await authService.getCurrentContext(accessToken);
          return { userId: context.userId, role: context.role };
        })();
  roleByUserId.set(verified.userId, verified.role);
  return verified;
};

export const requireAuth = createRequireAuth(verifyAccessToken);
// 토큰이 있으면 읽고 없으면 통과 — 공개 상세·추천처럼 "비로그인도 보되 로그인하면 더 보여주는"
// 라우트에 쓴다 (shared/optional-auth.ts 주석 참고).
const optionalAuth = createOptionalAuth(verifyAccessToken);

// `/internal/v1/...`은 사용자 토큰이 아니라 서버 간 토큰으로 보호한다 (project-management
// spec.md 규칙 49 · contracts-payments api-contract.md J1).
const requireServiceToken = createRequireServiceToken(process.env.INTERNAL_SERVICE_TOKEN);

// ---------------------------------------------------------------------------
// project-management — 공개 API 9종 + 내부 계약 7종.
//
// 내부 계약 라우트는 2026-08-27 반영에서 contracts-payments가 인메모리 대행으로 서빙했는데,
// api-contract.md가 정한 원래 구현자는 이쪽이다. 2026-08-28 통합에서 소유권을 되돌렸고
// contracts-payments는 순수 호출자가 됐다 (feedback_loop/2026-08-28/project-management.md 항목 1).
// ---------------------------------------------------------------------------

const projectRepository = new InMemoryProjectRepository();
const projectPorts = createInMemoryExternalPorts();
const projectNow = () => new Date().toISOString();

const projectService = createProjectService({
  repo: projectRepository,
  ports: projectPorts,
  now: projectNow,
  newProjectId: () => `prj_${randomId()}`,
});

const projectContractService = createProjectContractService({
  repo: projectRepository,
  ports: projectPorts,
  now: projectNow,
});

const projectReadService = createProjectReadService({
  repo: projectRepository,
  catalog: projectPorts.catalog,
  now: projectNow,
});

app.use(
  createProjectManagementRouter(projectService, projectContractService, {
    requireAuth,
    optionalAuth,
    requireServiceToken,
  }),
);

// ---------------------------------------------------------------------------
// engagement — 북마크·추천.
//
// 프로젝트 읽기 3종(CR-0001)과 역할 조회는 포트 뒤에 있고, 실제 구현을 끼우는 곳은 여기다.
// engagement 폴더는 project-management 폴더를 import하지 않는다 (app/web/AGENTS.md
// "폴더 간 접점"과 같은 원칙 — 기능 간 연결은 조립 지점에서만 한다).
// ---------------------------------------------------------------------------

const engagementService = createEngagementService({
  repo: new InMemoryBookmarkRepository(),
  ports: {
    projectRead: projectReadService,
    userRead: {
      // 위 roleByUserId 주석 참고 — user-management가 조회 함수를 내놓기 전까지의 잠정 연결이다.
      // 모르면 null을 준다. 서비스는 null을 FREELANCER가 아닌 것으로 보고 403을 낸다 (규칙 5) —
      // 모르는 것을 통과시키지 않는다.
      async getUserRole(userId: string) {
        return roleByUserId.get(userId) ?? null;
      },
    },
  },
  now: () => new Date().toISOString(),
  newBookmarkId: () => `bkm_${randomId()}`,
});

app.use(createEngagementRouter(engagementService, { requireAuth }));

// ---------------------------------------------------------------------------
// contracts-payments — 이제 내부 계약의 **호출자**다. 라우트를 서빙하지 않는다.
// 호출자 쪽 감사 로그(call log)는 그대로 남긴다 — 포트 구현자의 멱등 처리와는 목적이 다르다.
// ---------------------------------------------------------------------------

export const projectTransactionPort = createProjectManagementAdapter(projectContractService);
export const projectTransactionCallLog = new InMemoryProjectTransactionCallLogRepository();

// ---------------------------------------------------------------------------
// contracts-payments — 공개 API 7종(합의·서명·결제). api-contract.md "공개 API 초안" 절.
//
// sync-log.md 2026-09-01 반영에서 여기가 빠져 있었다 — 이번 반영으로 라우팅을 연결한다
// (CR-0010과 같은 종류의 "다음 통합 대상"이었으나 별도 CR 문서 없이 sync-log 자체에
// 예고돼 있던 항목이다).
//
// 결제 게이트웨이는 `PG_SECRET_KEY`가 없으면 만들지 않는다 — toss-payments.adapter.ts
// 주석대로, 키 없이 조용히 성공하는 가짜 결제보다 라우트 단계에서 503으로 끊는 쪽이 안전하다
// (public-api.controller.ts의 requirePgConfigured).
// ---------------------------------------------------------------------------

const paymentGatewayConfigured = hasPgSecretKey();
let paymentGateway: PaymentGateway | null = null;
if (paymentGatewayConfigured) {
  try {
    paymentGateway = createTossPaymentsAdapter();
  } catch (error) {
    console.warn(
      '[contracts-payments] PaymentGateway를 준비하지 못해 결제 라우트를 503으로 막습니다:',
      error instanceof Error ? error.message : error,
    );
  }
}

const contractsPaymentsRepository = new InMemoryContractsPaymentsRepository();

function contractsPaymentsRandomId(prefix: string): string {
  return `${prefix}_${randomId()}`;
}

const publicApiService = createPublicApiService({
  repo: contractsPaymentsRepository,
  projectPort: projectTransactionPort,
  paymentGateway,
  now: projectNow,
  randomId: contractsPaymentsRandomId,
});

app.use(
  createPublicApiRouter(publicApiService, {
    requireAuth,
    paymentGatewayConfigured: paymentGateway !== null,
  }),
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
