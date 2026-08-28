import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * 앱 셸 — 로고와 전역 내비게이션.
 *
 * 시안(`features/{기능}/design/high-fi-*.html`)의 모든 화면이 `.frame > header` 로 시작한다
 * (로고 `PactFive` + nav `프로젝트 찾기` · `내 프로젝트`). 시안에서는 화면 하나를 감싸는
 * 액자였지만 실제 앱에서는 라우트가 바뀌어도 남아야 하므로 라우터 안쪽 최상단에 둔다.
 *
 * 1차 반영에서 이 셸이 통째로 빠져 있었다 —
 * feedback_loop/2026-08-28/project-management.md 항목 5.
 *
 * ## 경로를 props 로 받는 이유
 *
 * nav 가 가리키는 경로는 project-management 소유다. `shared/` 가 기능 폴더를 import 하면
 * 방향이 거꾸로 서므로(app/web/AGENTS.md "폴더 간 접점") 조립 지점인 App.tsx 가 넣어 준다.
 */

export type NavItem = { label: string; to: string };

export type AppShellProps = {
  items: NavItem[];
  homeHref: string;
  children: ReactNode;
};

export function AppShell({ items, homeHref, children }: AppShellProps) {
  return (
    <>
      <div className="frame">
        <header>
          <NavLink to={homeHref} className="logo">
            PactFive
          </NavLink>
          <nav aria-label="주요 메뉴">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
      </div>
      {children}
    </>
  );
}

/**
 * 화면 본문 래퍼. 시안의 `.body-pad` 다.
 * `narrow` 는 폼 하나뿐인 화면(로그인·등록)에서 쓴다.
 */
export function PageBody({ narrow = false, children }: { narrow?: boolean; children: ReactNode }) {
  return <main className={`body-pad${narrow ? ' body-pad--narrow' : ''}`}>{children}</main>;
}
