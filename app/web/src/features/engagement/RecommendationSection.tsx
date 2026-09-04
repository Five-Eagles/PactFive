import { Link } from 'react-router-dom';
import { Chip, Money, RecruitmentBadge } from '../../shared/ui/primitives';
import { useRecommendations } from './useBookmark';
import type { RecommendedItem } from './bookmark.types';

/**
 * SCR-B09 — 추천 프로젝트 (프로젝트 상세 하단)
 *
 * 원본: features/engagement/prototype/web/RecommendationSection.tsx
 * (3e4977e — 39b7c89 반영분 CR-0006 "추천 사유를 화면에 말한다" 포함, 2026-09-03 통합)
 *
 * **후보가 없으면 섹션 자체를 감춘다** (규칙 24 · PRD §14.8).
 * 내 북마크와 다르다 — 북마크는 사용자가 담은 것이라 "없다"는 사실이 정보지만,
 * 추천은 보조 섹션이라 "추천할 것이 없습니다"가 화면에 남으면 소음이 된다.
 *
 * **순위를 화면에 쓰지 않는다** (규칙 28). 1순위·2순위 표시도, 내부 점수도 없다.
 * 배열 순서가 곧 순위다.
 *
 * **다만 왜 추천됐는지는 말한다** (CR-0006, §6 근거 이해). 규칙 28 이 금지한 것은 점수와
 * 순위값이지 사유 문구가 아니다. 사유 줄은 `design/high-fi-bookmarks.html` 에 그려져 있지
 * 않다(CR-0006 이 시안 작성 이후에 나온 결함이라) — 시안이 침묵하는 부분이라 기존 `.pcard`
 * 안에서 이미 쓰이는 `.caption`(시안 SCR-B01 카테고리 줄과 같은 클래스)으로 채웠다.
 * 새 클래스(원본의 `.reco__why`)를 만들지 않아 `check:design` 대상이 늘지 않는다 —
 * `feedback_loop/`에 남긴다.
 *
 * 구조 정본: `features/engagement/design/high-fi-bookmarks.html` SCR-B09 —
 * `.reco` 4열 그리드에 축소한 `.pcard` 를 넣는다 (본문 목록보다 글자·여백이 작다).
 *
 * 상세 경로는 project-management 소유라 호출부에서 주입받는다.
 */

/**
 * 사유를 문장으로 바꾼다.
 *
 * 기술이 겹치면 무엇이 겹쳤는지까지 말한다 — "기술이 맞아요" 보다
 * "React · TypeScript 가 같아요" 가 판단에 쓸모 있다.
 */
function reasonText(item: RecommendedItem, categoryName: string): string | null {
  const skills = item.matchedSkills.length ? item.matchedSkills.join(' · ') : null;
  switch (item.reason) {
    case 'SAME_CATEGORY_AND_SKILL':
      return skills ? `${categoryName} · ${skills} 가 같아요` : `${categoryName} 분야예요`;
    case 'SAME_CATEGORY':
      return `${categoryName} 분야예요`;
    case 'SHARED_SKILL':
      return skills ? `${skills} 를 함께 써요` : null;
    default:
      // 사유를 모르면 아무 말도 하지 않는다. 지어내지 않는다.
      return null;
  }
}

export type RecommendationSectionProps = {
  projectId: string;
  detailHref: (projectId: string) => string;
};

export function RecommendationSection({ projectId, detailHref }: RecommendationSectionProps) {
  const items = useRecommendations(projectId);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="reco-heading" style={{ marginTop: 32 }}>
      <h2 id="reco-heading" className="title">
        추천 프로젝트
      </h2>

      {/* 4건보다 적으면 있는 만큼만. 빈 칸을 두지 않는다 (규칙 23) */}
      <div className="reco">
        {items.map((project) => (
          <article key={project.projectId} className="pcard">
            <div className="pcard__top">
              <h3>
                <Link to={detailHref(project.projectId)}>{project.title}</Link>
              </h3>
              {/* 후보 조건이 OPEN 뿐이라 항상 "모집 중"이다 (규칙 18).
                  그래도 배지를 두는 것은 카드가 다른 목록과 같은 모양이어야 해서다. */}
              <RecruitmentBadge status={project.recruitmentStatus} />
            </div>
            <p className="pcard__budget">
              <Money amount={project.budgetAmount} />
            </p>
            <p className="pcard__skills">
              {project.skills.map((skill) => (
                <Chip key={skill.skillId} label={skill.displayName} />
              ))}
            </p>
            {/* 왜 이 프로젝트가 여기 있는지 (§6 근거 이해) */}
            {reasonText(project, project.category.displayName) && (
              <p className="caption" style={{ margin: 0 }}>
                {reasonText(project, project.category.displayName)}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
