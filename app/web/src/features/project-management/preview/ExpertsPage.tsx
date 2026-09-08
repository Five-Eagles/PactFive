import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState } from '../../../shared/ui/primitives';
import '../home/home.css';
import './preview.css';
import {
  EXPERT_CATEGORIES,
  EXPERT_SKILLS,
  EXPERT_SORTS,
  listExperts,
  type Expert,
} from './experts.data';
import { PREVIEW_ROUTES } from './preview.paths';

/**
 * 전문가 찾기 (미리보기).
 *
 * 원본: `design/reference-proposal/experts.html` · `demo/experts.js`
 *
 * **아직 없는 기능이다.** `ComingSoonOverlay` 뒤에서 블러 처리된 채로만 보인다 —
 * 그래도 실제로 동작하게 만든다. 준비 중이라는 말만 띄우고 뒤가 비어 있으면
 * "아직 안 만들었다"가 되지만, 화면이 살아 있으면 "여기까지 설계해 두었다"가 된다.
 *
 * 구조는 시안 그대로다 — 노란 소개 띠 · 왼쪽 상시 필터 · 정렬 알약 · 4열 카드 · 쪽 번호.
 * 필터를 접어 두지 않는 것도 프로젝트 찾기(browse)와 맞춘 것이다. 두 화면이 다르게
 * 생기면 같은 일을 두 번 배워야 한다.
 *
 * 조건은 주소에 남긴다. 블러 뒤에서도 주소는 진짜다.
 */
export function ExpertsPage() {
  const [params, setParams] = useSearchParams();

  const category = params.get('category') ?? '';
  const skills = params.getAll('skill');
  const sortBy = params.get('sort') ?? 'rating';
  const page = Number(params.get('page')) || 1;
  const skillsKey = skills.join(',');

  const result = useMemo(
    () => listExperts({ category, skills: skillsKey ? skillsKey.split(',') : [], sortBy, page }),
    [category, skillsKey, sortBy, page],
  );

  /** 조건을 바꾸면 1쪽으로 돌아간다 — 3쪽에서 필터를 걸면 빈 화면이 나온다 */
  function update(next: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(params);
    next(p);
    p.delete('page');
    setParams(p);
  }

  const hasFilter = category !== '' || skills.length > 0;

  return (
    <>
      <div className="pv-lead">
        <div className="pv-lead__in">
          <h1>일을 맡길 전문가를 찾아보세요</h1>
          <p>
            경력·단가·받은 평가를 같은 자리에서 비교합니다. 마음에 드는 사람을 찾으면 프로젝트를
            등록하고 지원을 받으세요.
          </p>
        </div>
      </div>

      <div className="pv">
        <div className="pv-layout">
          <aside className="card pv-filters">
            <h2>필터</h2>

            {/* 분야는 하나만 고른다 (규칙 58). 라디오라 "전체"로 되돌릴 자리가 있다 */}
            <div className="pv-fgroup">
              <b>분야</b>
              <label>
                <input
                  type="radio"
                  name="cat"
                  checked={category === ''}
                  onChange={() => update((p) => p.delete('category'))}
                />{' '}
                전체
              </label>
              {EXPERT_CATEGORIES.map((c) => (
                <label key={c.id}>
                  <input
                    type="radio"
                    name="cat"
                    checked={category === c.id}
                    onChange={() => update((p) => p.set('category', c.id))}
                  />{' '}
                  {c.name}
                </label>
              ))}
            </div>

            {/* 기술은 여러 개, 그리고 AND 다 — 고른 것을 모두 가진 사람만 (규칙 59).
                "전부 만족"이라고 적어 둔다. 안 적으면 OR 로 읽는 사람이 있다 */}
            <div className="pv-fgroup">
              <b>
                기술 <span className="caption">전부 만족</span>
              </b>
              {EXPERT_SKILLS.map((s) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    checked={skills.includes(s.id)}
                    onChange={() =>
                      update((p) => {
                        const rest = p.getAll('skill').filter((x) => x !== s.id);
                        p.delete('skill');
                        rest.forEach((x) => p.append('skill', x));
                        if (!skills.includes(s.id)) p.append('skill', s.id);
                      })
                    }
                  />{' '}
                  {s.name}
                </label>
              ))}
            </div>

            <Button
              variant="quiet"
              size="sm"
              fullWidth
              disabled={!hasFilter}
              onClick={() => setParams(new URLSearchParams())}
            >
              필터 초기화
            </Button>
          </aside>

          <section>
            <div className="pv-toolbar">
              <p className="pv-count">
                {hasFilter ? '조건에 맞는 전문가 ' : '전문가 '}
                <b className="num">{result.totalCount}</b>명
              </p>
              {/* 정렬은 펼쳐 둔다 — 접으면 지금 무엇으로 줄 세웠는지 열어 봐야 안다 */}
              <div className="pv-sorts" role="group" aria-label="정렬">
                {EXPERT_SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={sortBy === s.id}
                    onClick={() => update((p) => p.set('sort', s.id))}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {result.items.length === 0 ? (
              <EmptyState
                title="조건에 맞는 전문가가 없습니다"
                body="기술을 하나씩 빼 보시면 더 많은 분을 만나실 수 있습니다."
                action={
                  <Button variant="secondary" onClick={() => setParams(new URLSearchParams())}>
                    필터 초기화
                  </Button>
                }
              />
            ) : (
              <div className="grid4">
                {result.items.map((expert) => (
                  <ExpertCard key={expert.id} expert={expert} />
                ))}
              </div>
            )}

            {result.totalPages > 1 && (
              <nav className="pv-pager" aria-label="페이지">
                {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-current={n === result.page ? 'page' : undefined}
                    onClick={() => {
                      const p = new URLSearchParams(params);
                      p.set('page', String(n));
                      setParams(p);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </nav>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * 정보 순서를 고정한다: 작업물 · 이름 · 직함 · 분야 · 평점 · 경력 · 단가 · 기술.
 * 카드마다 순서가 다르면 눈으로 비교할 수 없다.
 */
function ExpertCard({ expert }: { expert: Expert }) {
  const to = PREVIEW_ROUTES.expertDetail(expert.id);
  return (
    <article className="card ecard">
      {/* 이름 링크와 같은 곳으로 간다. 읽어 주는 기계에는 한 번만 들리게 감춘다 */}
      <Link className="ecard__thumb" to={to} tabIndex={-1} aria-hidden="true">
        <img src={expert.shot} alt="" width={640} height={400} loading="lazy" />
      </Link>

      <div className="ecard__who">
        <span className="avatar" aria-hidden="true">
          {expert.name.slice(0, 1)}
        </span>
        <span className="ecard__name">
          <b>
            <Link to={to}>{expert.name}</Link>
          </b>
          <span className="ecard__title">{expert.title}</span>
        </span>
      </div>

      <p className="ecard__meta">
        <span className="chip">{expert.categoryName}</span>
        <ExpertRating expert={expert} />
      </p>

      <p className="ecard__facts">
        <span>
          경력 <b className="num">{expert.years}</b>년
        </span>
        <span>
          시간당 <b className="num">{expert.rate.toLocaleString('ko-KR')}</b>원
        </span>
      </p>

      <p className="ecard__skills">
        {expert.skills.map((s) => (
          <span key={s.id} className="chip">
            {s.name}
          </span>
        ))}
      </p>
    </article>
  );
}

/** 리뷰가 없으면 0.0 이 아니라 "평가 없음". **나쁜 것과 아직 없는 것은 다르다** */
export function ExpertRating({ expert }: { expert: Expert }) {
  if (expert.reviews === 0 || expert.rating === null) {
    return <span className="ecard__rate none">평가 없음</span>;
  }
  return (
    <span className="ecard__rate">
      <span className="star" aria-hidden="true">
        ★
      </span>{' '}
      <span className="num">{expert.rating.toFixed(1)}</span>{' '}
      <span className="caption num">({expert.reviews})</span>
    </span>
  );
}
