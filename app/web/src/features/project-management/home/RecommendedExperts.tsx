import { NotYetTrigger } from '../../../shared/ui/NotYetDialog';

/**
 * main.html "이번 주 추천 전문가" — 목업 카드 4장. 전문가 탐색은 PRD 화면 목록(§7.1)에 없다
 * (README "확인이 필요한 것" 1번). 2026-09-04 결정으로 섹션 자체는 시안대로 보여주고,
 * 실제로 갈 곳이 없는 카드 클릭·전체 보기만 `NotYetTrigger`로 막는다
 * (homepage-transplant-plan.md 5·6번 절).
 *
 * 데이터가 없어 이름·직함은 시안 톤에 맞춘 표시용 목업이다 — 실제 전문가 탐색 화면이 생기면
 * 이 섹션은 그 화면의 API로 통째로 바뀐다.
 */
const MOCK_EXPERTS = [
  { name: '김도현', title: '프론트엔드 · React', initial: '김' },
  { name: '박서연', title: 'UX 디자이너', initial: '박' },
  { name: '이준호', title: '백엔드 · Node.js', initial: '이' },
  { name: '최민아', title: '브랜드 디자이너', initial: '최' },
];

export function RecommendedExperts() {
  return (
    <section className="sec" style={{ paddingTop: 0 }}>
      <div className="sec__head">
        <h3>이번 주 추천 전문가</h3>
        <NotYetTrigger screenKey="experts" className="sec__more">
          전체 보기 ›
        </NotYetTrigger>
      </div>

      <ul className="grid4">
        {MOCK_EXPERTS.map((expert) => (
          <li key={expert.name}>
            <NotYetTrigger screenKey="experts" className="ecard">
              <div className="ecard__who">
                <span className="avatar" aria-hidden="true">
                  {expert.initial}
                </span>
                <div>
                  <span className="ecard__name">{expert.name}</span>
                  <span className="ecard__title">{expert.title}</span>
                </div>
              </div>
              <div className="ecard__facts">
                <span>평점 정보 없음</span>
              </div>
            </NotYetTrigger>
          </li>
        ))}
      </ul>
    </section>
  );
}
