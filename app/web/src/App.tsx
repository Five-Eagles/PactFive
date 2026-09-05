import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import './shared/ui/tokens.css';
import { APP_ROUTES } from './shared/routes';
import { setUnauthorizedHandler } from './shared/http';
import { NotIntegratedPage } from './shared/NotIntegratedPage';
import { AppShell, PageBody } from './shared/ui/AppShell';
import { ComingSoonOverlay } from './shared/ui/ComingSoonOverlay';
import type { NotYetScreenKey } from './shared/notYetScreens';
import { Button, EmptyState } from './shared/ui/primitives';
import { authRoutes, AUTH_ROUTES } from './features/user-management/auth.routes';
import { useAuth } from './features/user-management/useAuth';
import { projectRoutes, PROJECT_ROUTES } from './features/project-management/project.routes';
import { engagementRoutes, ENGAGEMENT_ROUTES } from './features/engagement/bookmark.routes';
import { contractRoutes } from './features/contracts-payments/contract.routes';
import { pricingAnalysisRoutes, PRICING_ANALYSIS_ROUTES } from './features/ai-pricing/pricing-analysis.routes';
import { applicationRoutes, APPLICATION_ROUTES } from './features/applications/application.routes';
import { reviewRoutes } from './features/reviews/review.routes';
import { BookmarkButton } from './features/engagement/BookmarkButton';
import { RecommendationSection } from './features/engagement/RecommendationSection';
import { useBookmarkedIds } from './features/engagement/useBookmark';

// 401을 받으면 로그인 화면으로 보낸다.
// shared/http.ts가 라우터를 직접 import하지 않도록 여기서 주입한다.
// 로그인 경로는 user-management 소유이므로 그 기능의 routes.tsx에서 가져온다
// (app/web/AGENTS.md — 특정 기능에 속하는 경로는 shared/routes.ts에 두지 않는다).
setUnauthorizedHandler(() => {
  window.location.assign(AUTH_ROUTES.login);
});

/**
 * 아직 설계/통합되지 않은 기능 라우트 — 경로 slug는 각 기능 폴더명을 그대로 kebab-case로 쓴다.
 * `featureName`은 `shared/notYetScreens.ts`의 키와 같은 문자열이다(우연이 아니다 — 폴더명
 * 그대로라 자연히 같다). 실제 화면 구현이 생기면 이 배열에서 빼고 해당 기능의
 * `{도메인}.routes.tsx`로 옮긴다.
 *
 * 2026-09-04: `ComingSoonOverlay`로 감싸기 시작했다 — 경로·기능 폴더는 있는데 화면이 아직
 * 안 붙은 상태(Case 2)라 `NotYetDialog`(화면 자체가 없는 Case 1)가 아니라 이쪽이다
 * (app/web/AGENTS.md "시안에는 있지만 아직 없는 화면" 절).
 */
const NOT_INTEGRATED_ROUTES: Array<{ path: string; featureName: NotYetScreenKey }> = [
  { path: '/notifications', featureName: 'notifications' },
];

function NotFoundPage() {
  return (
    <PageBody>
      <EmptyState
        title="없는 페이지입니다"
        body="주소를 다시 확인해 주세요."
        action={
          <Link to={APP_ROUTES.home}>
            <Button variant="secondary">홈으로</Button>
          </Link>
        }
      />
    </PageBody>
  );
}

/**
 * 라우터 조립 지점 — 기능별 라우트를 등록하는 곳은 여기 한 곳뿐이다
 * (app/server/src/app.ts가 백엔드 라우트를 한 곳에서 조립하는 것과 대칭).
 *
 * **기능 간 연결도 여기서만 한다.** engagement의 `BookmarkButton`·`RecommendationSection`은
 * project-management 화면 안에 붙지만, 두 기능 폴더는 서로를 import하지 않는다
 * (app/web/AGENTS.md "폴더 간 접점"). 그래서 project-management는 슬롯(render prop)만 열어두고
 * 실제 컴포넌트를 여기서 끼운다 — 서버의 app.ts가 engagement 서비스에 project-read 어댑터를
 * 주입하는 것과 같은 방식이다.
 *
 * 앱 셸(로고 + nav)도 여기서 두른다. nav가 가리키는 경로는 기능 소유라 `shared/ui/AppShell`이
 * 직접 알 수 없어 props로 넣는다.
 */
function AppRoutes() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, restore, logout } = useAuth();

  // 새로고침 후에도 로그인 상태를 이어간다 — Refresh Token은 HttpOnly 쿠키에 있고
  // Access Token은 메모리에만 있으므로, 앱이 뜰 때 한 번 복원해야 한다.
  // 실패는 정상적인 경우다(비로그인). useAuth가 anonymous로 되돌린다.
  useEffect(() => {
    void restore().catch(() => undefined);
  }, [restore]);

  const viewer = state.status === 'authenticated' ? state.session.user : null;

  // 카드마다 북마크 초기 상태를 넘긴다 (CR-0008) — `PublicProjectItem` 에는
  // `isBookmarked` 가 없어 engagement 의 `GET /bookmarks/ids` 로 화면이 직접 대조한다.
  // 프리랜서가 아니면 부르지 않는다 — 서버가 401·403 을 주기 전에 막는다.
  const bookmarkedIds = useBookmarkedIds(viewer?.role === 'FREELANCER');

  // 시안의 nav는 "프로젝트 찾기 · 내 프로젝트" 두 개다. 프리랜서에게는 "내 프로젝트"가
  // 의뢰인 전용이라 대신 "내 북마크"를 둔다 — 누를 수 없는 메뉴를 두지 않는다.
  const navItems = [
    { label: '프로젝트 찾기', to: PROJECT_ROUTES.browse },
    viewer?.role === 'FREELANCER'
      ? { label: '내 북마크', to: ENGAGEMENT_ROUTES.myBookmarks }
      : { label: '내 프로젝트', to: PROJECT_ROUTES.manage },
  ];

  const renderBookmark = (projectId: string) => (
    <BookmarkButton
      projectId={projectId}
      viewer={viewer ? { role: viewer.role } : null}
      initialBookmarked={bookmarkedIds.has(projectId)}
      onRequireLogin={() => navigate(AUTH_ROUTES.login)}
    />
  );

  const renderRecommendations = (projectId: string) => (
    <RecommendationSection projectId={projectId} detailHref={PROJECT_ROUTES.detail} />
  );

  const applyHref = (projectId: string) => APPLICATION_ROUTES.apply(projectId);
  const applicantsHref = (projectId: string) => APPLICATION_ROUTES.manage(projectId);

  // ai-pricing ↔ project-management 등록 폼 왕복 (2026-09-05) — 두 폴더는 서로 import하지
  // 않으므로 실제 쿼리 문자열 조립은 여기서만 한다.
  const pricingAnalysisHref = (query: { title: string; description: string; category: string }) => {
    const params = new URLSearchParams();
    if (query.title) params.set('title', query.title);
    if (query.description) params.set('description', query.description);
    if (query.category) params.set('category', query.category);
    const qs = params.toString();
    return qs ? `${PRICING_ANALYSIS_ROUTES.new}?${qs}` : PRICING_ANALYSIS_ROUTES.new;
  };

  const routes = (
    <Routes>
      {authRoutes}

      {projectRoutes({
        // 대표페이지는 project-management 화면이다. 다만 `/` 라는 **주소**는
        // 앱 껍데기(로고 링크)와 "없는 페이지"가 같이 쓰므로 앱이 계속 소유한다.
        homePath: APP_ROUTES.home,
        // 내 프로젝트 목록은 의뢰인 것만 의미가 있다.
        clientId: viewer?.role === 'CLIENT' ? viewer.userId : null,
        renderBookmark,
        renderRecommendations,
        // 대표 페이지 전용(Option C — 아래 참고).
        homeViewer: viewer ? { email: viewer.email, role: viewer.role, userId: viewer.userId } : null,
        homeMyActivityHref:
          viewer?.role === 'FREELANCER' ? ENGAGEMENT_ROUTES.myBookmarks : PROJECT_ROUTES.manage,
        onHomeLogout: () => {
          void logout();
        },
        applyHref,
        applicantsHref,
        pricingAnalysisHref,
      })}

      {engagementRoutes({
        isFreelancer: viewer?.role === 'FREELANCER',
        browseHref: PROJECT_ROUTES.browse,
        detailHref: PROJECT_ROUTES.detail,
      })}

      {contractRoutes({ viewerId: viewer?.userId ?? null })}

      {pricingAnalysisRoutes({ projectDetailHref: PROJECT_ROUTES.detail, registerHref: PROJECT_ROUTES.register })}

      {applicationRoutes()}

      {reviewRoutes()}

      {NOT_INTEGRATED_ROUTES.map(({ path, featureName }) => (
        <Route
          key={path}
          path={path}
          element={
            <ComingSoonOverlay screenKey={featureName}>
              <NotIntegratedPage featureName={featureName} />
            </ComingSoonOverlay>
          }
        />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );

  // 대표 페이지(Option C)는 AppShell을 쓰지 않는다 — 시안 자신의 헤더를 그린다
  // (features/project-management/design/homepage-transplant-plan.md 4번 절 2026-09-04 결정).
  // 다른 모든 화면은 그대로 AppShell로 감싼다.
  if (location.pathname === APP_ROUTES.home) return routes;

  return (
    <AppShell items={navItems} homeHref={APP_ROUTES.home}>
      {routes}
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
