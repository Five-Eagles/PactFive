import { Link } from 'react-router-dom';
import { INFO_ROUTES } from './info.paths';

/**
 * 안내 화면들의 공통 머리 띠.
 *
 * 시안(`guide.html`)에서는 이용 방법과 안전한 거래가 한 문서 안의 두 절이었다.
 * 앱에서는 주소를 나눈다 — 헤더의 두 메뉴가 각자 갈 곳이 있어야 하고, 어느 화면에
 * 있는지가 주소에 남아야 한다.
 *
 * 대신 **한 문서였다는 사실은 남긴다.** 두 화면이 서로를 가리키는 자리를 띠 안에 두고,
 * 지금 보는 쪽을 표시한다. 나눠 놓고 서로를 모르면 읽던 흐름이 끊긴다.
 */
export function InfoBand({ current }: { current: 'guide' | 'safety' }) {
  return (
    <section className="if-band">
      <div className="if-band__in">
        <h1>등록부터 정산까지 한곳에서</h1>
        <p>
          프로젝트를 올리고, 지원을 받고, 합의한 금액으로 계약하고, 납품을 확인한 뒤
          정산합니다. 각 단계에서 무슨 일이 일어나는지 양쪽이 같은 화면에서 봅니다.
        </p>
        <nav className="if-toc" aria-label="안내 문서">
          <Link to={INFO_ROUTES.guide} aria-current={current === 'guide' ? 'page' : undefined}>
            이용 방법
          </Link>
          <Link to={INFO_ROUTES.safety} aria-current={current === 'safety' ? 'page' : undefined}>
            안전한 거래
          </Link>
        </nav>
      </div>
    </section>
  );
}
