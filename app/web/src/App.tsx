import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { APP_ROUTES } from './shared/routes';
import { setUnauthorizedHandler } from './shared/http';
import { NotIntegratedPage } from './shared/NotIntegratedPage';
import { authRoutes, AUTH_ROUTES } from './features/user-management/auth.routes';

// 401을 받으면 로그인 화면으로 보낸다.
// shared/http.ts가 라우터를 직접 import하지 않도록 여기서 주입한다.
// 로그인 경로는 user-management 소유이므로 그 기능의 routes.tsx에서 가져온다
// (app/web/AGENTS.md — 특정 기능에 속하는 경로는 shared/routes.ts에 두지 않는다).
setUnauthorizedHandler(() => {
  window.location.assign(AUTH_ROUTES.login);
});

function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>PactFive</h1>
      <p>통합 애플리케이션 스캐폴드입니다. 기능은 아직 등록되지 않았습니다.</p>
      <p>
        <Link to={AUTH_ROUTES.login}>로그인</Link>
      </p>
    </main>
  );
}

/**
 * 아직 설계/통합되지 않은 기능 라우트 — 경로 slug는 각 기능 폴더명을 그대로 kebab-case로 쓴다.
 * 실제 화면 구현이 생기면 이 배열에서 빼고 해당 기능의 `{도메인}.routes.tsx`로 옮긴다.
 */
const NOT_INTEGRATED_ROUTES: Array<{ path: string; featureName: string }> = [
  { path: '/project-management', featureName: 'project-management' },
  { path: '/applications', featureName: 'applications' },
  { path: '/ai-pricing', featureName: 'ai-pricing' },
  { path: '/reviews', featureName: 'reviews' },
  { path: '/engagement', featureName: 'engagement' },
  { path: '/notifications', featureName: 'notifications' },
  { path: '/contracts-payments', featureName: 'contracts-payments' },
];

function NotFoundPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
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
 * 기능을 통합할 때 아래처럼 그 기능의 routes를 가져와 펼친다:
 *
 *   import { authRoutes } from './features/user-management/auth.routes';
 *   ...
 *   {authRoutes}
 *
 * 다른 기능 폴더의 파일을 직접 import하지 않는다 (app/web/AGENTS.md).
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={APP_ROUTES.home} element={<HomePage />} />
        {/* 기능별 라우트를 여기에 등록한다 */}
        {authRoutes}
        {NOT_INTEGRATED_ROUTES.map(({ path, featureName }) => (
          <Route key={path} path={path} element={<NotIntegratedPage featureName={featureName} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
