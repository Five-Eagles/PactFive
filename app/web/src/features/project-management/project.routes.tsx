import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ProjectBrowsePage } from './ProjectBrowsePage';
import { ProjectDetailPage } from './ProjectDetailPage';
import { ProjectEditPage } from './ProjectEditPage';
import { ProjectManagePage } from './ProjectManagePage';
import { ProjectRegisterForm } from './ProjectRegisterForm';
import { previewRoutes } from './preview/preview.routes';

/**
 * project-management 라우트 정의 + 경로 상수.
 *
 * 경로 문자열은 여기서만 만든다. 화면 컴포넌트가 경로를 하드코딩하지 않는다
 * (app/web/AGENTS.md "진입점 구조").
 *
 * `renderBookmark` · `renderRecommendations` 는 engagement 소유 컴포넌트를 끼우는 슬롯이다.
 * 이 폴더가 engagement 폴더를 import 하지 않기 위한 장치이고, 실제 연결은 `App.tsx` 가 한다.
 */
export const PROJECT_ROUTES = {
  browse: '/projects',
  detail: (projectId: string) => `/projects/${projectId}`,
  register: '/projects/new',
  manage: '/my/projects',
  edit: (projectId: string) => `/my/projects/${projectId}/edit`,
} as const;

export type ProjectRouteSlots = {
  /**
   * 앱 루트 경로. 대표페이지를 이 자리에 건다.
   *
   * **주소는 앱 소유, 화면은 이 기능 소유다.** `/` 는 앱 껍데기의 로고 링크와
   * "없는 페이지"의 홈 버튼이 함께 쓰는 자리라 `APP_ROUTES.home` 에 남는다.
   * 그래서 여기서 경로 문자열을 만들지 않고 App.tsx 에게 받는다.
   */
  homePath: string;
  /** 로그인한 의뢰인의 id. 내 프로젝트 목록을 부를 때 쓴다 */
  clientId: string | null;
  renderBookmark?: (projectId: string) => ReactNode;
  renderRecommendations?: (projectId: string) => ReactNode;
  /** 대표 페이지 전용 — 이 화면은 AppShell을 안 쓰고 자기 헤더를 그려서 세션 정보가 직접 필요하다
   * (homepage-transplant-plan.md 4번 절 Option C). */
  homeViewer: { email: string; role: 'CLIENT' | 'FREELANCER'; userId: string } | null;
  homeMyActivityHref: string;
  onHomeLogout: () => void;
};

export function projectRoutes({
  homePath,
  clientId,
  renderBookmark,
  renderRecommendations,
  homeViewer,
  homeMyActivityHref,
  onHomeLogout,
}: ProjectRouteSlots) {
  return (
    <>
      {/* 대표페이지 — 주소만 앱에서 받고 화면은 이 폴더 것이다 (위 homePath 주석 참고) */}
      <Route
        path={homePath}
        element={
          <HomePage
            viewer={homeViewer}
            myActivityHref={homeMyActivityHref}
            onLogout={onHomeLogout}
            renderBookmark={renderBookmark}
          />
        }
      />
      <Route
        path={PROJECT_ROUTES.browse}
        element={<ProjectBrowsePage renderBookmark={renderBookmark} />}
      />
      {/* 등록 경로를 상세보다 먼저 둔다 — `/projects/new` 가 `:projectId` 로 잡히면 안 된다 */}
      <Route path={PROJECT_ROUTES.register} element={<ProjectRegisterForm />} />
      <Route
        path="/projects/:projectId"
        element={
          <ProjectDetailPage
            renderBookmark={renderBookmark}
            renderRecommendations={renderRecommendations}
          />
        }
      />
      <Route path={PROJECT_ROUTES.manage} element={<ProjectManagePage clientId={clientId} />} />
      {/* 등록(/projects/new)과 마찬가지로 :projectId 라우트보다 더 구체적인 경로다 */}
      <Route path="/my/projects/:projectId/edit" element={<ProjectEditPage />} />

      {/* 시안에는 있지만 아직 만들기로 정하지 않은 화면들 — 전부 ComingSoonOverlay 뒤다.
          담당이 정해지면 그 기능 폴더로 옮기고 여기서 뺀다 (preview/preview.routes.tsx) */}
      {previewRoutes()}
    </>
  );
}
