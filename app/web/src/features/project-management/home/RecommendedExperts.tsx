import { Link } from 'react-router-dom';
import { listExperts } from '../preview/experts.data';
import { ExpertRating } from '../preview/ExpertsPage';
import { PREVIEW_ROUTES } from '../preview/preview.paths';

/**
 * main.html "이번 주 추천 전문가" — 카드 4장.
 *
 * 전문가 탐색은 PRD 화면 목록(§7.1)에 없다 (README "확인이 필요한 것" 1번).
 * 2026-09-04 결정으로 섹션은 시안대로 두고, 갈 곳은 `ComingSoonOverlay` 뒤의
 * 미리보기 화면으로 잇는다.
 *
 * **데이터는 `preview/experts.data.ts` 하나를 쓴다.** 전에는 이 파일이 자기만의 목업 4명을
 * 들고 있었는데, 전문가 찾기 화면이 생기면서 홈에 보이던 사람이 목록에는 없는 상태가 됐다.
 * 같은 사이트 안에서 같은 사람이 달라 보이면 그 자리에서 신뢰가 깨진다.
 *
 * 고르는 규칙은 목록의 기본 정렬과 같다 — 평점순 위에서 4명. **"추천"이라는 이름으로
 * 설명할 수 없는 점수를 만들지 않는다** (engagement 규칙 28 과 같은 이유).
 */
export function RecommendedExperts() {
  const experts = listExperts({ sortBy: 'rating' }).items.slice(0, 4);

  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="sec__head">
        <h3>이번 주 추천 전문가</h3>
        <Link className="sec__more" to={PREVIEW_ROUTES.experts}>
          전체 보기 ›
        </Link>
      </div>

      <ul className="grid4">
        {experts.map((expert) => (
          <li key={expert.id}>
            <Link className="ecard" to={PREVIEW_ROUTES.expertDetail(expert.id)}>
              <div className="ecard__who">
                <span className="avatar" aria-hidden="true">
                  {expert.name.slice(0, 1)}
                </span>
                <div>
                  <span className="ecard__name">{expert.name}</span>
                  <span className="ecard__title">{expert.title}</span>
                </div>
              </div>
              <div className="ecard__facts">
                <ExpertRating expert={expert} />
                <span>
                  경력 <b className="num">{expert.years}</b>년
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
