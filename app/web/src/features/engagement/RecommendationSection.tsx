import { Link } from 'react-router-dom';
import { Chip, Money, RecruitmentBadge } from '../../shared/ui/primitives';
import { useRecommendations } from './useBookmark';

/**
 * SCR-B09 — 추천 프로젝트 (프로젝트 상세 하단)
 *
 * 원본: features/engagement/prototype/web/RecommendationSection.tsx (3e4977e)
 *
 * **후보가 없으면 섹션 자체를 감춘다** (규칙 24 · PRD §14.8).
 * 내 북마크와 다르다 — 북마크는 사용자가 담은 것이라 "없다"는 사실이 정보지만,
 * 추천은 보조 섹션이라 "추천할 것이 없습니다"가 화면에 남으면 소음이 된다.
 *
 * **순위를 화면에 쓰지 않는다** (규칙 28). 1순위·2순위 표시도, 내부 점수도 없다.
 * 배열 순서가 곧 순위다.
 *
 * 상세 경로는 project-management 소유라 호출부에서 주입받는다.
 */

export type RecommendationSectionProps = {
  projectId: string;
  detailHref: (projectId: string) => string;
};

export function RecommendationSection({ projectId, detailHref }: RecommendationSectionProps) {
  const items = useRecommendations(projectId);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="reco-heading">
      <h2 id="reco-heading">추천 프로젝트</h2>

      {/* 4건보다 적으면 있는 만큼만. 빈 칸을 두지 않는다 (규칙 23) */}
      <div className="reco">
        {items.map((project) => (
          <article key={project.projectId} className="card">
            <h3>
              <Link to={detailHref(project.projectId)}>{project.title}</Link>
            </h3>
            <p className="card__meta">
              <Money amount={project.budgetAmount} />
            </p>
            <p className="card__meta">
              {project.skills.map((skill) => (
                <Chip key={skill.skillId} label={skill.displayName} />
              ))}
            </p>
            {/* 후보 조건이 OPEN 뿐이라 항상 "모집 중"이다 (규칙 18).
                그래도 배지를 두는 것은 카드가 다른 목록과 같은 모양이어야 해서다. */}
            <RecruitmentBadge status={project.recruitmentStatus} />
          </article>
        ))}
      </div>
    </section>
  );
}
