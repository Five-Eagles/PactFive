import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import './shared/ui/tokens.css';
import { APP_ROUTES } from './shared/routes';
import { setUnauthorizedHandler } from './shared/http';
import { NotIntegratedPage } from './shared/NotIntegratedPage';
import { authRoutes, AUTH_ROUTES } from './features/user-management/auth.routes';
import { useAuth } from './features/user-management/useAuth';
import { projectRoutes, PROJECT_ROUTES } from './features/project-management/project.routes';
import { engagementRoutes, ENGAGEMENT_ROUTES } from './features/engagement/bookmark.routes';
import { BookmarkButton } from './features/engagement/BookmarkButton';
import { RecommendationSection } from './features/engagement/RecommendationSection';

// 401을 받으면 로그인 화면으로 보낸다.
// shared/http.ts가 라우터를 직접 import하지 않도록 여기서 주입한다.
// 로그인 경로는 user-management 소유이므로 그 기능의 routes.tsx에서 가져온다
// (app/web/AGENTS.md — 특정 기능에 속하는 경로는 shared/routes.ts에 두지 않는다).
setUnauthorizedHandler(() => {
  window.location.assign(AUTH_ROUTES.login);
});

function HomePage() {
  return (
    <main className="page">
      <h1>PactFive</h1>
      <p>프리랜서와 의뢰인을 잇는 프로젝트 거래 플랫폼입니다.</p>
      <ul className="list">
        <li>
          <Link to={PROJECT_ROUTES.browse}>프로젝트 찾기</Link>
        </li>
        <li>
          <Link to={PROJECT_ROUTES.manage}>내 프로젝트</Link>
        </li>
        <li>
          <Link to={ENGAGEMENT_ROUTES.myBookmarks}>내 북마크</Link>
        </li>
        <li>
          <Link to={AUTH_ROUTES.login}>로그인</Link>
        </li>
      </ul>
    </main>
  );
}

/**
 * 아직 설계/통합되지 않은 기능 라우트 — 경로 slug는 각 기능 폴더명을 그대로 kebab-case로 쓴다.
 * 실제 화면 구현이 생기면 이 배열에서 빼고 해당 기능의 `{도메인}.routes.tsx`로 옮긴다.
 *
 * 2026-08-28 통합에서 project-management · engagement를 뺐다 — 두 기능은 이제 자기
 * routes 파일을 갖는다. contracts-payments는 원본에 `prototype/web/`이 없어 그대로 둔다.
 */
const NOT_INTEGRATED_ROUTES: Array<{ path: string; featureName: string }> = [
  { path: '/applications', featureName: 'applications' },
  { path: '/ai-pricing', featureName: 'ai-pricing' },
  { path: '/reviews', featureName: 'reviews' },
  { path: '/notifications', featureName: 'notifications' },
  { path: '/contracts-payments', featureName: 'contracts-payments' },
];

function NotFoundPage() {
  return (
    <main className="page">
      <h1>404</h1>
      <p>없는 페이지입니다.</p>
      <Link to={APP_ROUTES.home}>홈으로</Link>
    </main>
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
 * 주입하는 것과 같은 방식이다. feedback_loop/2026-08-28/engagement.md 항목 3 참고.
 */
function AppRoutes() {
  const navigate = useNavigate();
  const { state, restore } = useAuth();

  // 새로고침 후에도 로그인 상태를 이어간다 — Refresh Token은 HttpOnly 쿠키에 있고
  // Access Token은 메모리에만 있으므로, 앱이 뜰 때 한 번 복원해야 한다.
  // 실패는 정상적인 경우다(비로그인). useAuth가 anonymous로 되돌린다.
  useEffect(() => {
    void restore().catch(() => undefined);
  }, [restore]);

  const viewer = state.status === 'authenticated' ? state.session.user : null;

  const renderBookmark = (projectId: string) => (
    <BookmarkButton
      projectId={projectId}
      viewer={viewer ? { role: viewer.role } : null}
      onRequireLogin={() => navigate(AUTH_ROUTES.login)}
    />
  );

  const renderRecommendations = (projectId: string) => (
    <RecommendationSection projectId={projectId} detailHref={PROJECT_ROUTES.detail} />
  );

  return (
    <Routes>
      <Route path={APP_ROUTES.home} element={<HomePage />} />

      {authRoutes}

      {projectRoutes({
        // 내 프로젝트 목록은 의뢰인 것만 의미가 있다.
        clientId: viewer?.role === 'CLIENT' ? viewer.userId : null,
        renderBookmark,
        renderRecommendations,
      })}

      {engagementRoutes({
        isFreelancer: viewer?.role === 'FREELANCER',
        browseHref: PROJECT_ROUTES.browse,
        detailHref: PROJECT_ROUTES.detail,
      })}

      {NOT_INTEGRATED_ROUTES.map(({ path, featureName }) => (
        <Route key={path} path={path} element={<NotIntegratedPage featureName={featureName} />} />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
