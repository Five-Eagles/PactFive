import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState } from '../../../shared/ui/primitives';
import '../home/home.css';
import './preview.css';
import { EXPERT_SHOTS, findExpert, type Expert } from './experts.data';
import { PREVIEW_ROUTES } from './preview.paths';

/**
 * 전문가 프로필 (미리보기).
 *
 * 원본: `design/reference-proposal/expert.html`
 *
 * 겹 규칙을 그대로 쓴다 — 노란 띠(판) → 흰 카드(표면) → 아바타(부양).
 *
 * **"지원하기"가 아니라 "프로젝트 등록하고 제안받기"다.** 이 서비스에서 일은 프로젝트를
 * 통해 오간다. 사람에게 바로 발주하는 길은 없다 (PRD §5.2 전체 흐름).
 * 없는 길을 버튼으로 만들지 않는다.
 */
export function ExpertDetailPage() {
  const { expertId } = useParams();
  const expert = expertId ? findExpert(expertId) : null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [expertId]);

  if (!expert) {
    return (
      <div className="pv">
        <EmptyState
          title="전문가를 찾을 수 없습니다"
          body="주소가 바뀌었거나 활동을 멈춘 계정입니다."
          action={
            <Link to={PREVIEW_ROUTES.experts}>
              <Button variant="primary">전문가 찾기</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const hasReviews = expert.reviews > 0 && expert.rating !== null;

  return (
    <div className="pv">
      <p className="pv-crumb">
        <Link to={PREVIEW_ROUTES.experts}>전문가 찾기</Link> ›{' '}
        <Link to={`${PREVIEW_ROUTES.experts}?category=${expert.category}`}>
          {expert.categoryName}
        </Link>
      </p>

      <div className="pv-hero" aria-hidden="true" />
      <div className="card pv-head-card">
        <div className="pv-card-head">
          <span className="pv-pavatar" aria-hidden="true">
            {expert.name.slice(0, 1)}
          </span>
          <span className="pv-who">
            <h1>{expert.name}</h1>
            <p>{expert.title}</p>
            <span className="pv-who__chips">
              <span className="chip">{expert.categoryName}</span>
              {expert.skills.map((s) => (
                <span key={s.id} className="chip">
                  {s.name}
                </span>
              ))}
            </span>
          </span>
          {hasReviews ? (
            <span className="pv-rate">
              <b>
                <span className="star" aria-hidden="true">
                  ★
                </span>{' '}
                {expert.rating!.toFixed(1)}
              </b>
              <span>리뷰 {expert.reviews}건</span>
            </span>
          ) : (
            /* 0.0 으로 그리면 "나쁘다"로 읽힌다. "아직 없다"와 다르다 */
            <span className="pv-rate none">
              <b>평가 없음</b>
              <span>첫 거래를 기다립니다</span>
            </span>
          )}
        </div>
      </div>

      <div className="pv-body">
        <div>
          <section className="card pv-block">
            <h2>소개</h2>
            <p className="pv-bio">{expert.bio}</p>
          </section>

          {/* 작업물이 이 화면의 본론이다. 가장 큰 자리를 준다 */}
          <section className="card pv-block">
            <h2>작업물</h2>
            <ul className="pv-shots">
              {portfolio(expert).map((shot) => (
                <li key={shot.name}>
                  <figure className="pv-shot">
                    <img
                      src={shot.src}
                      alt={`${expert.name}의 ${shot.name}`}
                      width={640}
                      height={400}
                      loading="lazy"
                    />
                    <figcaption>
                      <b>{shot.name}</b>
                      {expert.categoryName} · {shot.year}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>

          <section className="card pv-block">
            <h2>기본 정보</h2>
            <div className="pv-kv">
              <span className="pv-kv__k">주요 분야</span>
              <span>{expert.categoryName}</span>
            </div>
            <div className="pv-kv">
              <span className="pv-kv__k">경력</span>
              <span className="num">{expert.years}년</span>
            </div>
            <div className="pv-kv">
              <span className="pv-kv__k">시간당 단가</span>
              <span className="num">{expert.rate.toLocaleString('ko-KR')}원</span>
            </div>
            <div className="pv-kv">
              <span className="pv-kv__k">기술</span>
              <span className="pv-who__chips">
                {expert.skills.map((s) => (
                  <span key={s.id} className="chip">
                    {s.name}
                  </span>
                ))}
              </span>
            </div>
          </section>

          {/* 리뷰가 없으면 섹션을 감춘다. 빈 제목만 남기지 않는다 */}
          {hasReviews && (
            <section className="card pv-block">
              <h2>
                받은 평가 <span className="caption num">{expert.reviews}건 중 3건</span>
              </h2>
              {SAMPLE_REVIEWS.map((r) => (
                <div key={r.who} className="pv-rev">
                  <p className="pv-rev__top">
                    <span className="pv-rev__who">{r.who}</span>
                    <span className="star">★ {expert.rating!.toFixed(1)}</span>
                    <span className="pv-rev__when num">{r.when}</span>
                  </p>
                  <p>{r.text}</p>
                </div>
              ))}
            </section>
          )}
        </div>

        <aside className="pv-side">
          <div className="card pv-hire">
            <p className="pv-hire__rate">
              시간당 <b className="num">{expert.rate.toLocaleString('ko-KR')}원</b>
            </p>
            {/* 사람에게 바로 발주하는 길은 이 서비스에 없다. 프로젝트를 통한다 */}
            <Button variant="primary">프로젝트 등록하고 제안받기</Button>
            <p className="pv-hire__note">
              이 서비스는 프로젝트를 통해 일이 오갑니다. 프로젝트를 등록하면 이 전문가를 포함해
              조건에 맞는 분들이 지원합니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * 작업물 4장. 가진 사진 4장을 그 사람의 대표 사진부터 돌려 쓴다.
 * 없는 작업물을 지어내지 않고, 있는 것을 같은 순서로 보여준다.
 */
function portfolio(expert: Expert) {
  const names = ['운영 대시보드', '백오피스 화면', '브랜드 가이드', '콘텐츠 패키지'];
  const start = EXPERT_SHOTS.indexOf(expert.shot);
  return names.map((name, i) => ({
    name,
    src: EXPERT_SHOTS[(Math.max(start, 0) + i) % EXPERT_SHOTS.length],
    year: 2026 - i,
  }));
}

/**
 * 표시용 리뷰 3건.
 *
 * **리뷰는 reviews 기능(조준영) 것이다.** 여기 값은 시안이 자리를 보여주려고 넣어 둔
 * 표본이며, 실제 리뷰 형식을 정하는 근거가 아니다. 평점과 건수만 ERD 에 있는 값을 쓴다.
 */
const SAMPLE_REVIEWS = [
  {
    who: '주식회사 마루컴퍼니',
    when: '2026.08.21',
    text: '요청한 것보다 먼저 물어봐 주셔서 헤맬 일이 없었습니다. 중간 공유가 꾸준했습니다.',
  },
  {
    who: '라온물류',
    when: '2026.07.30',
    text: '일정이 촉박했는데 무엇을 먼저 뺄지 같이 정해 주셨습니다. 다음에도 함께하고 싶습니다.',
  },
  {
    who: '데일리핏',
    when: '2026.06.12',
    text: '결과물도 좋았지만 왜 그렇게 했는지 설명이 명확했습니다.',
  },
];
