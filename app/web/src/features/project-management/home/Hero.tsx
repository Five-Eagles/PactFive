import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECT_ROUTES } from '../project.routes';

/**
 * main.html `.hero` — 검색 폼 + "인기 검색" 5개. 데이터 의존 없는 정적 섹션이다.
 *
 * 검색은 `/projects?keyword=...`로 이동한다. 원본은 정적 데모라 해시(`#keyword=`)를 썼지만
 * (파일 시스템에 서버가 없어서), 실제 앱은 쿼리스트링 + `ProjectBrowsePage`의
 * `useSearchParams()` 초기값 읽기로 대응했다.
 *
 * "인기 검색" 5개는 시안 하드코딩 그대로다 — 검색 로그 테이블이 없어 실제 인기 검색어를 낼
 * 수 없다(README "확인이 필요한 것" 4번, 팀장 확인 필요로 아직 남아 있다).
 */
const POPULAR_KEYWORDS = ['React', 'Figma', '쇼핑몰', '리뉴얼', '관리 시스템'];

export function Hero() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    navigate(trimmed ? `${PROJECT_ROUTES.browse}?keyword=${encodeURIComponent(trimmed)}` : PROJECT_ROUTES.browse);
  }

  return (
    <div className="hero__copy">
      <h1>
        좋은 협업을 만드는
        <br />
        전문가를 찾아보세요.
      </h1>
      <p className="sub">검증된 경력과 실제 결과물을 비교하고, 계약까지 안전하게 이어가세요.</p>

      <form className="search" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="home-search">
          검색어
        </label>
        <div className="searchbox">
          <input
            id="home-search"
            name="keyword"
            type="search"
            placeholder="기술이나 키워드로 찾아보세요"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" stroke="var(--content)" strokeWidth="2.4" />
            <path d="M15.5 15.5 20 20" stroke="var(--content)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        <button className="find-btn" type="submit">
          프로젝트 찾기
        </button>
      </form>

      <p className="keywords">
        <strong>인기 검색</strong>
        {POPULAR_KEYWORDS.map((keyword) => (
          <Link key={keyword} to={`${PROJECT_ROUTES.browse}?keyword=${encodeURIComponent(keyword)}`}>
            {keyword}
          </Link>
        ))}
      </p>
    </div>
  );
}
