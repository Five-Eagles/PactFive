import { NotYetTrigger } from '../../../shared/ui/NotYetDialog';

/**
 * main.html `<footer>` — 지금은 홈 화면 전용이다. 사이트 전체 푸터로 승격할지는 별도 결정
 * 사항(homepage-transplant-plan.md 9번 Decision). 메뉴 3개(이용약관·개인정보처리방침·
 * 고객센터)는 화면 자체가 없어 전부 NotYet이다.
 */
export function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-wrap">
        <span>PactFive</span>
        <NotYetTrigger screenKey="footer-terms">이용약관</NotYetTrigger>
        <NotYetTrigger screenKey="footer-privacy">개인정보처리방침</NotYetTrigger>
        <NotYetTrigger screenKey="footer-support">고객센터</NotYetTrigger>
      </div>
    </footer>
  );
}
