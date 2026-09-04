/**
 * SCR-B09 추천 프로젝트 — 프로젝트 상세 하단
 *
 * **후보가 없으면 섹션 자체를 감춘다** (규칙 24 · PRD §14.8).
 * 내 북마크와 다르다 — 북마크는 사용자가 담은 것이라 "없다"는 사실이 정보지만,
 * 추천은 보조 섹션이라 "추천할 것이 없습니다"가 화면에 남으면 소음이 된다.
 *
 * **순위를 화면에 쓰지 않는다** (규칙 28). 1순위·2순위 표시도, 내부 점수도 없다.
 * 배열 순서가 곧 순위다.
 *
 * 다만 **왜 추천됐는지는 말한다** (CR-0006, §6 근거 이해). 규칙 28 이 금지한 것은
 * 점수와 순위값이지 사유 문구가 아니다. 순서로만 표현하면 사용자는
 * 왜 하필 이 4건인지 알 수 없다.
 */

import { Chip, Money, RecruitmentBadge, type RecruitmentStatus } from "./ui";

/** 서버가 준다. 화면이 판정하지 않는다 */
export type RecommendationReason =
  | "SAME_CATEGORY_AND_SKILL"
  | "SAME_CATEGORY"
  | "SHARED_SKILL";

export type RecommendedProject = {
  projectId: string;
  reason?: RecommendationReason;
  /** 겹친 기술 이름 */
  matchedSkills?: string[];
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
};

/**
 * 사유를 문장으로 바꾼다.
 *
 * 기술이 겹치면 무엇이 겹쳤는지까지 말한다 — "기술이 맞아요" 보다
 * "React · TypeScript 가 같아요" 가 판단에 쓸모 있다.
 */
function reasonText(p: RecommendedProject, categoryName: string): string | null {
  const skills = p.matchedSkills?.length ? p.matchedSkills.join(" · ") : null;
  switch (p.reason) {
    case "SAME_CATEGORY_AND_SKILL":
      return skills ? `${categoryName} · ${skills} 가 같아요` : `${categoryName} 분야예요`;
    case "SAME_CATEGORY":
      return `${categoryName} 분야예요`;
    case "SHARED_SKILL":
      return skills ? `${skills} 를 함께 써요` : null;
    default:
      // 사유를 모르면 아무 말도 하지 않는다. 지어내지 않는다.
      return null;
  }
}

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
            {/* 왜 이 프로젝트가 여기 있는지 (§6 근거 이해) */}
            {reasonText(p, p.category.displayName) && (
              <p className="reco__why">{reasonText(p, p.category.displayName)}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
