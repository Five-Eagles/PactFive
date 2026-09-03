import { Link } from 'react-router-dom';
import { PROJECT_ROUTES } from '../project.routes';
import { HOME_CATEGORIES } from './categories';

/**
 * main.html `.cats` — 카테고리 10칸. 아이콘 SVG는 시안 것을 그대로 옮겼다.
 * 목적지 매핑 근거는 `categories.ts` 주석 참고.
 */
const ICONS: Record<string, JSX.Element> = {
  web: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="4" y="6" width="56" height="43" rx="3" />
      <path className="ln" d="M4 14h56" />
      <circle cx="9" cy="10" r="1.4" fill="var(--ico-yellow)" />
      <circle cx="13" cy="10" r="1.4" fill="var(--ico-blue-pale)" />
      <path
        d="m27 25-7 7 7 7M37 25l7 7-7 7M34 22l-4 20"
        fill="none"
        stroke="var(--ico-blue)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  app: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="18" y="3" width="30" height="48" rx="5" />
      <path className="ln" d="M28 8h10" />
      <path
        d="m31 24-5 5 5 5M36 24l5 5-5 5"
        fill="none"
        stroke="var(--ico-blue)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ux: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="6" y="6" width="48" height="42" rx="3" />
      <path className="ln" d="M6 14h48" />
      <rect className="ln" x="13" y="21" width="15" height="15" />
      <path className="ln" d="m13 34 6-6 4 3 5-5" />
      <path className="ln" d="M33 22h14M33 28h14M33 34h10" />
      <path d="m49 37 8 4-4 1 2 6-2 1-3-6-3 2z" fill="var(--ico-ink)" />
    </svg>
  ),
  brand: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <path className="ln" d="M15 5h34v44H15z" />
      <path d="M18 8h28v4H18z" fill="var(--ico-yellow)" />
      <circle cx="32" cy="30" r="11" fill="var(--ico-yellow)" stroke="var(--ico-yellow-deep)" />
      <text x="32" y="33.5" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--ico-navy)">
        BRAND
      </text>
    </svg>
  ),
  marketing: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <path d="M13 25 40 15v24L13 29z" fill="var(--ico-blue)" />
      <path className="ln" d="M40 21c8 2 9 10 1 13" />
      <path d="m19 31 4 13h7l-3-15" fill="var(--ico-blue-soft)" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect x="11" y="16" width="42" height="29" rx="5" fill="var(--ico-navy)" />
      <rect className="ln" x="23" y="11" width="17" height="7" rx="2" />
      <circle cx="32" cy="31" r="11" fill="var(--ico-grey)" />
      <circle cx="32" cy="31" r="7" fill="var(--ico-navy-deep)" />
    </svg>
  ),
  content: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="11" y="5" width="33" height="43" rx="2" />
      <path className="ln" d="M17 14h20M17 21h20M17 28h16M17 35h13" />
      <path d="m36 35 13-10 4 5-13 10-7 2z" fill="var(--ico-yellow)" />
    </svg>
  ),
  data: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <circle cx="15" cy="18" r="6" fill="var(--ico-mint)" />
      <circle cx="39" cy="10" r="5" fill="var(--ico-blue)" />
      <circle cx="20" cy="40" r="5" fill="var(--ico-mint)" />
      <circle cx="47" cy="39" r="6" fill="var(--ico-grey-pale)" />
      <path className="ln" d="M20 16 34 12M17 24l2 11M25 38l16 1M42 15l4 18" />
      <ellipse className="ln" cx="34" cy="26" rx="7" ry="3" />
      <path className="ln" d="M27 26v7c0 2 14 2 14 0v-7" />
    </svg>
  ),
  planning: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="11" y="7" width="44" height="35" rx="2" />
      <path className="ln" d="M11 13h44" />
      <path
        d="M20 20h4M20 26h4M20 32h4"
        fill="none"
        stroke="var(--ico-yellow)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path className="ln" d="M29 20h17M29 26h17M29 32h12" />
      <path className="ln" d="M28 42l-3 8M44 42l3 8" />
    </svg>
  ),
  all: (
    <svg viewBox="0 0 64 54" aria-hidden="true">
      <rect className="ln" x="10" y="7" width="17" height="17" rx="3" />
      <rect className="ln" x="37" y="7" width="17" height="17" rx="3" />
      <rect className="ln" x="10" y="31" width="17" height="17" rx="3" />
      <rect className="ln" x="37" y="31" width="17" height="17" rx="3" />
    </svg>
  ),
};

export function CategoryGrid() {
  return (
    <section className="cats">
      <div className="cats__grid">
        {HOME_CATEGORIES.map((cat) => (
          <Link
            key={cat.key}
            className="cat"
            to={cat.category ? `${PROJECT_ROUTES.browse}?category=${encodeURIComponent(cat.category)}` : PROJECT_ROUTES.browse}
          >
            <span className="cat__ico">
              {cat.hot && <span className="cat__hot">인기</span>}
              {ICONS[cat.key]}
            </span>
            {cat.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
