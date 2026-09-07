import { Link } from 'react-router-dom';
import { INFO_ROUTES } from '../info/info.paths';

/**
 * main.html `<footer>` — 지금은 홈 화면 전용이다. 사이트 전체 푸터로 승격할지는 별도 결정
 * 사항(homepage-transplant-plan.md 9번 Decision).
 *
 * 2026-09-04: 세 메뉴가 실제 화면으로 이어진다. 전에는 화면이 없어 다이얼로그만 열었다.
 * 문서 내용은 아직 확정 전이고, 그것은 각 화면이 직접 말한다 — **문서가 미완인 것과
 * 화면이 없는 것은 다르다.**
 */
export function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-wrap">
        <span>PactFive</span>
        <Link to={INFO_ROUTES.terms}>이용약관</Link>
        <Link to={INFO_ROUTES.privacy}>개인정보처리방침</Link>
        <Link to={INFO_ROUTES.support}>고객센터</Link>
      </div>
    </footer>
  );
}
