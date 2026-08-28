/**
 * SCR-B09 추천 프로젝트 — 프로젝트 상세 하단
 *
 * **후보가 없으면 섹션 자체를 감춘다** (규칙 24 · PRD §14.8).
 * 내 북마크와 다르다 — 북마크는 사용자가 담은 것이라 "없다"는 사실이 정보지만,
 * 추천은 보조 섹션이라 "추천할 것이 없습니다"가 화면에 남으면 소음이 된다.
 *
 * **순위를 화면에 쓰지 않는다** (규칙 28). 1순위·2순위 표시도, 내부 점수도 없다.
 * 배열 순서가 곧 순위다.
 */

import { Chip, Money, RecruitmentBadge, type RecruitmentStatus } from "./ui";

export type RecommendedProject = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
};

export type RecommendationSectionProps = {
  items?: RecommendedProject[];
  onOpen?: (projectId: string) => void;
};

export function RecommendationSection({ items = [], onOpen }: RecommendationSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="reco-section" aria-labelledby="reco-heading">
      <h2 id="reco-heading">추천 프로젝트</h2>

      {/* 4건보다 적으면 있는 만큼만. 빈 칸을 두지 않는다 (규칙 23) */}
      <div className="reco">
        {items.map((p) => (
          <article
            key={p.projectId}
            className="pcard"
            onClick={() => onOpen?.(p.projectId)}
          >
            <h3>{p.title}</h3>
            <p className="budget">
              <Money amount={p.budgetAmount} />
            </p>
            <p className="skills">
              {p.skills.map((s) => (
                <Chip key={s.skillId} label={s.displayName} />
              ))}
            </p>
            {/* 후보 조건이 OPEN 뿐이라 항상 "모집 중"이다 (규칙 18).
                그래도 배지를 두는 것은 카드가 다른 목록과 같은 모양이어야 해서다. */}
            <RecruitmentBadge status={p.recruitmentStatus} />
          </article>
        ))}
      </div>
    </section>
  );
}
