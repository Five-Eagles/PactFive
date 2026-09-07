import { Link, NavLink } from 'react-router-dom';
import { PREVIEW_ROUTES } from '../preview/preview.paths';
import { INFO_ROUTES } from '../info/info.paths';
import { APP_ROUTES } from '../../../shared/routes';
import { AUTH_ROUTES } from '../../user-management/auth.routes';
import { PROJECT_ROUTES } from '../project.routes';

/**
 * 대표 페이지 전용 헤더 — main.html의 `.hdr`을 그대로 이식했다.
 *
 * **AppShell을 쓰지 않는다 (Option C, 2026-09-04 결정).** 시안 자신의 4메뉴 헤더를 디자인의
 * 루트로 삼기로 했기 때문이다 — 이 화면만 그렇고, 다른 화면은 여전히 AppShell을 쓴다
 * (`features/project-management/design/homepage-transplant-plan.md` 4번 절).
 *
 * 2026-09-04 부터 네 메뉴가 모두 실제 주소로 간다.
 * "이용 방법"·"안전한 거래"는 완성된 화면이라 그냥 열리고, "전문가 찾기"는 화면은
 * 그려지되 `ComingSoonOverlay` 가 블러와 다이얼로그를 덮는다. 어느 쪽이든 이동은
 * 진짜라서 여기서는 전부 평범한 `NavLink` 다.
 *
 * 오른쪽 영역(`.hdr__act`)은 시안 markup에 `data-session-actions`로 비워 두고
 * `bundle.html`의 `demo/session.js`(`paintHeader`)가 채우는 것으로 돼 있었다 — 거기 적힌
 * 문구를 그대로 옮겼다: 비로그인 "로그인 · 프로젝트 등록", 로그인 "이름 · 로그아웃 ·
 * 프로젝트 등록". 다만 "이름 클릭 → 마이페이지"는 실제 앱에 마이페이지 화면이 없어(원본도
 * `#/mypage` 해시일 뿐이다), 같은 목적의 실제 화면(의뢰인→내 프로젝트, 프리랜서→내 북마크)으로
 * 대신 연결했다 — 이 판단은 feedback_loop에 남긴다.
 */
export type HomeHeaderProps = {
  viewer: { email: string; role: 'CLIENT' | 'FREELANCER' } | null;
  /** 로그인 상태일 때 "이름" 링크가 갈 곳 — 의뢰인은 내 프로젝트, 프리랜서는 내 북마크 */
  myActivityHref: string;
  onLogout: () => void;
};

export function HomeHeader({ viewer, myActivityHref, onLogout }: HomeHeaderProps) {
  return (
    <header className="home-hdr">
      <div className="home-hdr__in">
        <NavLink to={APP_ROUTES.home} className="brand">
          Pact<em>Five</em>
        </NavLink>
        <nav aria-label="주요 메뉴">
          <NavLink to={PROJECT_ROUTES.browse}>프로젝트 찾기</NavLink>
          <NavLink to={PREVIEW_ROUTES.experts}>전문가 찾기</NavLink>
          <NavLink to={INFO_ROUTES.guide}>이용 방법</NavLink>
          <NavLink to={INFO_ROUTES.safety}>안전한 거래</NavLink>
        </nav>
        <div className="home-hdr__act">
          {viewer ? (
            <>
              <Link to={myActivityHref} className="login">
                {viewer.email} 님
              </Link>
              <button type="button" className="home-hdr__logout" onClick={onLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <Link to={AUTH_ROUTES.login} className="login">
              로그인
            </Link>
          )}
          <Link to={PROJECT_ROUTES.register} className="btn-reg">
            프로젝트 등록
          </Link>
        </div>
      </div>
    </header>
  );
}
