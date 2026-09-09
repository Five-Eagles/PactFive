import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { config as loadEnvFile } from 'dotenv';
import cors from 'cors';
import { createAuthRouter } from './features/user-management/auth.routes';
import { AuthSessionService } from './features/user-management/auth.service';
import { createSupabaseAuthAdapter } from './features/user-management/supabase-auth.adapter';
import { MockAuthProvider } from './features/user-management/mock-auth.adapter';
import { InMemoryAuthRepository } from './features/user-management/in-memory-auth.repository';
import { PrismaAuthRepository } from './features/user-management/prisma-auth.repository';
import { authenticateMockAuthorization } from './features/user-management/auth.mock';
import type { AuthProvider } from './features/user-management/auth.port';
import type { AuthRepositories } from './features/user-management/auth.repository';
import { getPrismaClient, isPrismaConfigured } from './shared/prisma-client';
import { createRequireAuth } from './shared/require-auth';
import { createOptionalAuth } from './shared/optional-auth';
import { createRequireServiceToken } from './shared/require-service-token';
import { createProjectManagementRouter } from './features/project-management/project.routes';
import { createProjectService } from './features/project-management/project.service';
import { createProjectContractService } from './features/project-management/project-contract.service';
import { createProjectReadService } from './features/project-management/project-read.service';
import { InMemoryProjectRepository } from './features/project-management/in-memory-project.repository';
import { PrismaProjectRepository } from './features/project-management/prisma-project.repository';
import { createInMemoryExternalPorts } from './features/project-management/in-memory-external.adapter';
import { createEngagementRouter } from './features/engagement/bookmark.routes';
import { createEngagementService } from './features/engagement/bookmark.service';
import { InMemoryBookmarkRepository } from './features/engagement/in-memory-bookmark.repository';
import { PrismaBookmarkRepository } from './features/engagement/prisma-bookmark.repository';
import { InMemoryProjectTransactionCallLogRepository } from './features/contracts-payments/in-memory-project-transaction-call-log.repository';
import { createProjectManagementAdapter } from './features/contracts-payments/project-management.adapter';
import { InMemoryContractsPaymentsRepository } from './features/contracts-payments/in-memory-contracts-payments.repository';
import { PrismaContractsPaymentsRepository } from './features/contracts-payments/prisma-contracts-payments.repository';
import {
  createContractsPaymentsSnapshotReader,
  createPublicApiService,
} from './features/contracts-payments/public-api.service';
import { createPublicApiRouter } from './features/contracts-payments/public-api.routes';
import { InMemoryNotificationTriggerAdapter } from './features/contracts-payments/in-memory-notification.adapter';
import { createTransactionLifecycleCoordinator } from './features/contracts-payments/transaction-lifecycle.coordinator';
import { hasPgSecretKey, createTossPaymentsAdapter } from './features/contracts-payments/toss-payments.adapter';
import type { PaymentGateway } from './features/contracts-payments/payment.port';
import { InMemoryPricingAnalysisRepository } from './features/ai-pricing/in-memory-pricing-analysis.repository';
import { PrismaPricingAnalysisRepository } from './features/ai-pricing/prisma-pricing-analysis.repository';
import { InMemoryPricingAnalysisRateLimit } from './features/ai-pricing/in-memory-pricing-analysis-rate-limit';
import { createPricingAnalysisClaimPort } from './features/ai-pricing/pricing-analysis-claim.adapter';
import { ProjectBudgetApplicationAdapter } from './features/ai-pricing/project-budget-application.adapter';
import { OpenAIPricingAnalyzer } from './features/ai-pricing/openai.adapter';
import { createPricingAnalysisRouter } from './features/ai-pricing/pricing-analysis.router';
import { InMemoryApplicationRepository } from './features/applications/in-memory-application.repository';
import { PrismaApplicationRepository } from './features/applications/prisma-application.repository';
import { InMemoryApplicationNotificationPort } from './features/applications/in-memory-application-notification';
import { createApplicationsPortAdapter } from './features/applications/applications-port.adapter';
import { createProjectApplicationContextAdapter } from './features/applications/project-application-context.adapter';
import { createAcceptProjectApplicationAdapter } from './features/applications/accept-project-application.adapter';
import { createApplicationRouter } from './features/applications/application.router';
import { InMemoryReviewRepository } from './features/reviews/in-memory-review.repository';
import { PrismaReviewRepository } from './features/reviews/prisma-review.repository';
import { InMemoryReviewEventPort } from './features/reviews/in-memory-review-event';
import { createProjectReviewContextAdapter } from './features/reviews/project-review-context.adapter';
import { createReviewRouter } from './features/reviews/review.router';

/**
 * Express 앱 — 순수 모듈. 여기서 `app.listen()`을 호출하지 않는다.
 * 배포 진입점은 분리한다 (app/server/AGENTS.md "배포 아키텍처"):
 *   - app/server/index.js (빌드 산출물, git에 없음) → esbuild가 이 파일을 번들링해서 만든다.
 *     Vercel의 "Express on Vercel" zero-config가 Root Directory 바로 밑 `index.js`를
 *     자동 감지해 배포한다.
 *   - src/dev-server.ts → 로컬 독립 서버
 *
 * 2026-09-06 — 이 파일 이름을 `app.ts`에서 `express-app.ts`로 바꿨다. Vercel의 Express
 * zero-config 자동 감지 대상 경로 중 하나가 정확히 `src/app.{js,ts,...}`라서, 이 이름 그대로
 * 두면 Vercel이 번들링 안 된 이 파일을 직접 배포 대상으로 잡아버렸다 — 그게 진짜 배포 크래시
 * 원인이었다. 아래 "빌드 산출물" 문단 참고.
 */

// 2026-09-05 버그 수정 — tsx는 .env를 자동으로 읽지 않는다. 그동안 리포 루트 `.env`(Supabase·
// OpenAI·토스페이먼츠 키 등)를 채워도 아무 코드가 이걸 process.env로 올려주지 않아서, 이
// 파일이 조용히 모든 값을 "비어 있음"으로 읽고 각 기능의 mock/미설정 기본값으로 빠졌다
// (예: user-management가 AUTH_PROVIDER_MODE=supabase를 무시하고 계속 MockAuthProvider를 써서,
// 회원가입 화면은 성공을 보여주지만 실제 확인 메일은 나가지 않았다). 이 한 줄로 로컬 실행 시
// (src/dev-server.ts 경유) 루트 .env가 실제로 반영된다.
// 이미 설정된 값(Vercel 배포 환경변수 등)은 덮어쓰지 않는다(dotenv 기본 동작 — override: false).
// 배포 환경처럼 이 경로에 .env가 없으면 조용히 아무 효과가 없다.
// 참고 — 아래 상대 경로(3단계 위)는 이 파일이 원본 그대로 실행될 때(app/server/src/ 기준)
// 기준으로 계산했다. esbuild로 번들링된 app/server/index.js로 실행되면 실제 파일 위치가 한
// 단계 얕아져서(app/server/ 기준) 이 경로가 repo 루트보다 한 단계 위를 가리키게 되지만,
// 배포 환경에는 애초에 그 경로에 .env 파일이 없으므로(Vercel이 실제 환경변수를 직접 주입)
// 조용히 무효과일 뿐이다 — 로컬 개발 경로만 정확하면 된다.
loadEnvFile({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

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
  // 2026-09-07: DATABASE_URL이 있으면 실제 Postgres(Supabase)로, 없으면 인메모리로 —
  // 다른 벤더 키(PG_SECRET_KEY 등)와 동일한 Boolean(process.env.X) fail-soft 패턴이다.
  // 값이 없어도 서버는 그대로 동작한다(.env.example 공통 규칙 1) — 로컬/아직 마이그레이션
  // 안 한 배포 환경은 지금처럼 인메모리로 계속 굴러간다. auth만 우선 전환한다 — 다른
  // 기능(project-management 등)의 인메모리 저장소는 이 트랙 범위 밖이다.
  // 2026-09-08: authProviderMode도 같이 본다 — mock 인증 상태에서는 DATABASE_URL이 있어도
  // 강제로 InMemory로 묶는다(shared/prisma-client.ts의 isPrismaConfigured 주석 참고 —
  // mock 인증의 가짜 userId가 실제 users 테이블에 없어 FK가 깨지는 걸 막는 정합성 요구사항).
  authRepositories = isPrismaConfigured(authProviderMode)
    ? new PrismaAuthRepository(getPrismaClient())
    : new InMemoryAuthRepository();
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

// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트.
const projectRepository = isPrismaConfigured(authProviderMode)
  ? new PrismaProjectRepository(getPrismaClient())
  : new InMemoryProjectRepository();
const projectPorts = createInMemoryExternalPorts();
const projectNow = () => new Date().toISOString();

// ai-pricing의 저장소는 project-management보다 먼저 만든다 — 아래 CR-0003 회신(연결 포트)이
// project.service.ts/project-contract.service.ts 구성 전에 준비돼야 하기 때문이다.
// PricingAnalysisRateLimit 은 무제한(In-memory-first, 실제 창 기반 제한은 Prisma 도입 이후).
// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트.
const pricingAnalysisRepository = isPrismaConfigured(authProviderMode)
  ? new PrismaPricingAnalysisRepository(getPrismaClient())
  : new InMemoryPricingAnalysisRepository();
const pricingAnalysisRateLimit = new InMemoryPricingAnalysisRateLimit();

// CR-0003(유동우, 2026-08-26) 회신 — project-management가 등록·예산반영 시점에 부르는
// PricingAnalysisClaimPort를 여기서 실제로 연결한다. 등록 전에는 fail-closed 스텁이었다
// (in-memory-external.adapter.ts의 createUnavailablePricingPort).
projectPorts.pricing = createPricingAnalysisClaimPort(pricingAnalysisRepository);

// applications(최윤석)의 저장소도 project-management보다 먼저 만든다 — 마감·취소 시
// project-management가 부르는 ApplicationsPort.rejectPendingApplications를 여기서 실제로
// 연결한다. 등록 전에는 fail-closed 스텁이었다(in-memory-external.adapter.ts의
// createUnavailableApplicationsPort) — applications가 app/에 붙은 오늘부터 실제로 처리한다.
// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트.
const applicationRepository = isPrismaConfigured(authProviderMode)
  ? new PrismaApplicationRepository(getPrismaClient())
  : new InMemoryApplicationRepository();
const applicationNotifications = new InMemoryApplicationNotificationPort();
projectPorts.applications = createApplicationsPortAdapter(applicationRepository, applicationNotifications);

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
// ai-pricing — 단가 분석 3종(생성·조회·예산 반영). features/ai-pricing/spec.md Step 2.
//
// 예산 반영(POST .../apply)은 project-management가 이미 갖고 있는 계약 함수 7
// (applyPricingAnalysisBudget, 규칙 40)에 위임한다 — 팀장 결정(2026-09-04). 이 어댑터는
// project-management를 직접 import하지 않는다(app/web/AGENTS.md "폴더 간 접점") — 여기서는
// `projectContractService`를 그 모양 그대로 delegate로 끼운다(contracts-payments의
// project-management.adapter.ts와 같은 패턴).
//
// OpenAI 연동은 PG_SECRET_KEY와 같은 원칙이다 — 다만 라우트 자체를 막는 대신
// OpenAIPricingAnalyzer.configured가 false를 돌려주게 두고, 분석 생성만 서비스 레이어에서
// 503 PRICING_ANALYZER_UNAVAILABLE로 막는다(pricing-analysis.service.ts). 조회·예산 반영은
// OpenAI 없이도 동작해야 하므로 라우트 단위로 끊지 않는다.
// ---------------------------------------------------------------------------

const pricingAnalysisAnalyzer = new OpenAIPricingAnalyzer({
  apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_PRICING_MODEL ?? '',
  schemaCompatibleModels: (process.env.OPENAI_PRICING_SCHEMA_MODELS ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean),
});

const projectBudgetApplication = new ProjectBudgetApplicationAdapter(
  projectContractService,
  pricingAnalysisRepository,
);

app.use(
  createPricingAnalysisRouter(
    {
      repository: pricingAnalysisRepository,
      analyzer: pricingAnalysisAnalyzer,
      rateLimit: pricingAnalysisRateLimit,
      projectBudgetApplication,
      now: projectNow,
      nextAnalysisId: () => `pra_${randomId()}`,
    },
    { requireAuth },
  ),
);

// ---------------------------------------------------------------------------
// applications — 지원 8종(eligibility·작성·목록 2종·단건 조회·수락·거절·operation 조회,
// PR #83로 5종에서 늘었다). features/applications/api-contract.md.
//
// 프로젝트 읽기(clientId·recruitmentStatus·transactionStatus·acceptedApplicationId)와
// 수락 처리는 project-management의 `projectContractService`에 위임한다 — 이 폴더는
// project-management를 직접 import하지 않는다(app/web/AGENTS.md "폴더 간 접점") — 여기서만
// `projectContractService`를 그 모양 그대로 두 delegate에 끼운다(ai-pricing의
// project-budget-application.adapter.ts와 같은 패턴). 그래서 이 두 어댑터는
// projectContractService가 만들어진 **뒤에** 구성한다.
// ---------------------------------------------------------------------------

const projectApplicationContext = createProjectApplicationContextAdapter(projectContractService);
const acceptProjectApplicationDelegate = createAcceptProjectApplicationAdapter(projectContractService);

app.use(
  createApplicationRouter(
    {
      repository: applicationRepository,
      projectContext: projectApplicationContext,
      notifications: applicationNotifications,
      projectApplications: acceptProjectApplicationDelegate,
      now: projectNow,
      nextRequestId: () => randomId(),
    },
    { requireAuth },
  ),
);

// ---------------------------------------------------------------------------
// engagement — 북마크·추천.
//
// 프로젝트 읽기 3종(CR-0001)과 역할 조회는 포트 뒤에 있고, 실제 구현을 끼우는 곳은 여기다.
// engagement 폴더는 project-management 폴더를 import하지 않는다 (app/web/AGENTS.md
// "폴더 간 접점"과 같은 원칙 — 기능 간 연결은 조립 지점에서만 한다).
// ---------------------------------------------------------------------------

// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트.
const engagementService = createEngagementService({
  repo: isPrismaConfigured(authProviderMode)
    ? new PrismaBookmarkRepository(getPrismaClient())
    : new InMemoryBookmarkRepository(),
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

// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트.
const contractsPaymentsRepository = isPrismaConfigured(authProviderMode)
  ? new PrismaContractsPaymentsRepository(getPrismaClient())
  : new InMemoryContractsPaymentsRepository();

function contractsPaymentsRandomId(prefix: string): string {
  return `${prefix}_${randomId()}`;
}

// 2026-09-07 팀장 반영 — sync-log.md 2026-09-03(67207c8) 이후 develop에 쌓인 #53·#66·#58·#80
// 4개 PR 분량(재제안 AGR-02/03·납품 DLV-01·정산 조회 SET-01 v2·취소 조회 CAN-01 v2·교차
// 생명주기 Coordinator)을 여기서 처음 배선한다. 알림 발행은 notifications가 아직 app/에
// 실제 인바운드를 붙이지 않아(위 reviews 섹션 주석과 같은 이유) 인메모리로 로그만 남긴다.
const contractsPaymentsNotifications = new InMemoryNotificationTriggerAdapter();

const transactionLifecycleCoordinator = createTransactionLifecycleCoordinator({
  projects: projectTransactionPort,
  snapshots: createContractsPaymentsSnapshotReader(contractsPaymentsRepository),
  notifications: contractsPaymentsNotifications,
});

const publicApiService = createPublicApiService({
  repo: contractsPaymentsRepository,
  projectPort: projectTransactionPort,
  paymentGateway,
  notifications: contractsPaymentsNotifications,
  coordinator: transactionLifecycleCoordinator,
  now: projectNow,
  randomId: contractsPaymentsRandomId,
});

app.use(
  createPublicApiRouter(publicApiService, {
    requireAuth,
    requireServiceToken,
    paymentGatewayConfigured: paymentGateway !== null,
  }),
);

// ---------------------------------------------------------------------------
// 로컬 개발 전용 — DevAuthToggle(app/web)의 "기능별 시드 계정 피커" 지원용 2종.
// `!isProduction` 밖에서는 이 블록 자체가 실행되지 않는다 — 라우트가 아예 등록되지 않으므로
// 배포 환경에는 존재하지 않는다(이중 방어 없이 단순 조건 분기). `/api/` 접두사를 붙인 건
// (다른 `/internal/v1/...`와 달리) app/web의 vite proxy가 `/api`만 넘겨주기 때문이다
// (app/web/vite.config.ts) — 브라우저에서 직접 부를 수 있어야 하는 이 두 엔드포인트만 예외다.
if (!isProduction) {
  // scripts/seed-dev-accounts.js가 리포 루트에 쓰는 파일 — 이메일/비밀번호를 그대로 담고
  // 있지만 전부 @example.com 가짜 계정이고, 이 파일 자체가 .gitignore에 있어 커밋되지 않는다.
  const devAccountsFilePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../.dev-accounts.local.json',
  );

  app.get('/api/internal/dev/test-accounts', (_req: Request, res: Response) => {
    if (!existsSync(devAccountsFilePath)) {
      res.status(200).json({ accounts: [] });
      return;
    }
    try {
      res.status(200).json(JSON.parse(readFileSync(devAccountsFilePath, 'utf8')));
    } catch {
      // 파일이 깨져 있어도(수동 편집 중이었다든가) 위젯은 "계정 없음"으로만 보이면 된다 —
      // 로컬 개발 편의 기능이 500으로 화면을 막을 이유가 없다.
      res.status(200).json({ accounts: [] });
    }
  });

  // 정산 RELEASED 전이는 실제 지급 버튼이 없어(public-api.service.ts의
  // simulateSettlementResult 주석 — "Sandbox 정산 실행은 지급 버튼이 없어, 이 함수를
  // 직접 호출해야만") 사용자 API로는 절대 도달할 수 없다. scripts/seed-dev-accounts.js의
  // "결제 완료" 시나리오가 실제 토스 결제(브라우저, 이건 대신할 수 없다)까지 마친 뒤 이
  // 엔드포인트로 그 다음 단계만 이어 부른다 — 같은 publicApiService 인스턴스를 그대로
  // 호출할 뿐, 별도 로직이나 DB 우회가 없다.
  app.post('/api/internal/dev/simulate-settlement', async (req: Request, res: Response) => {
    const paymentId = String((req.body as Record<string, unknown> | undefined)?.paymentId ?? '');
    if (!paymentId) {
      res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'paymentId가 필요합니다.', details: null },
      });
      return;
    }
    try {
      await publicApiService.simulateSettlementResult(paymentId, 'SUCCESS');
      res.status(200).json({ ok: true });
    } catch (error) {
      res
        .status(500)
        .json({ error: { code: 'INTERNAL_ERROR', message: String(error), details: null } });
    }
  });
}

// ---------------------------------------------------------------------------
// reviews — 공개 API 3종(작성·목록·요약). features/reviews/api-contract.md.
//
// 이 기능이 필요로 하는 프로젝트 조각은 project-management(clientId·transactionStatus)와
// contracts-payments(freelancerId·contractId·contractStatus) 양쪽에 걸쳐 있다 —
// `contractsPaymentsRepository`가 막 만들어진 이 지점에서만 두 delegate를 합칠 수 있어
// applications·ai-pricing보다 뒤에 온다. "사용자가 존재하는가"는 user-management가 조회
// 함수를 내놓기 전까지 engagement와 같은 방식으로 `roleByUserId` 캐시를 재사용한다
// (review.types.ts UserExistsPort 주석).
//
// `getPublishedRatingAggregate`(내부 함수, api-contract.md)는 review.service.ts에 그대로
// 있지만 이번 반영에서는 HTTP 어댑터를 만들지 않는다 — 아직 이 값을 구독하는 다른 기능이
// app/에 없다(notifications 담당 미정). 필요해지면 그때 라우트를 연다
// (feedback_loop/2026-09-05/reviews.md).
// ---------------------------------------------------------------------------

// 2026-09-08: 다른 기능과 같은 isPrismaConfigured(authProviderMode) 게이트 — mock 인증이면
// InMemory, 그 외(supabase)면 Prisma. 6기능 Prisma 이식 트랙(팀장 작업).
const reviewRepository = isPrismaConfigured(authProviderMode)
  ? new PrismaReviewRepository(getPrismaClient())
  : new InMemoryReviewRepository();
const reviewEvents = new InMemoryReviewEventPort();
const reviewProjectContext = createProjectReviewContextAdapter(projectContractService, contractsPaymentsRepository);

app.use(
  createReviewRouter(
    {
      repository: reviewRepository,
      projectContext: reviewProjectContext,
      userExistsPort: {
        async userExists(userId: string) {
          return roleByUserId.has(userId);
        },
      },
      events: reviewEvents,
      now: projectNow,
    },
    { requireAuth },
  ),
);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal Server Error' });
});

export default app;
