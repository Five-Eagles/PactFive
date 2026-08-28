import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { ProjectBrowsePage } from './ProjectBrowsePage';
import { ProjectDetailPage } from './ProjectDetailPage';
import { ProjectManagePage } from './ProjectManagePage';
import { ProjectRegisterForm } from './ProjectRegisterForm';

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
} as const;

export type ProjectRouteSlots = {
  /** 로그인한 의뢰인의 id. 내 프로젝트 목록을 부를 때 쓴다 */
  clientId: string | null;
  renderBookmark?: (projectId: string) => ReactNode;
  renderRecommendations?: (projectId: string) => ReactNode;
};

export function projectRoutes({
  clientId,
  renderBookmark,
  renderRecommendations,
}: ProjectRouteSlots) {
  return (
    <>
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
    </>
  );
}
