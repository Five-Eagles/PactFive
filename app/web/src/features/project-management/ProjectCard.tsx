import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Chip, DeadlineIndicator, Money, RecruitmentBadge } from '../../shared/ui/primitives';
import { PROJECT_ROUTES } from './project.routes';
import type { PublicProjectItem } from './project.types';

/**
 * `.pcard` — 목록 화면(`browse.html`)과 대표 페이지(`main.html`)가 같이 쓰는 프로젝트 카드.
 *
 * 2026-09-04까지는 `ProjectBrowsePage.tsx`에 인라인돼 있었다. 대표 페이지의 "지금 모집 중인
 * 프로젝트" 섹션이 같은 카드를 다시 그려야 해서 이번에 뽑아냈다 — 마크업·순서는 그대로,
 * 옮기기만 했다 (`features/project-management/design/homepage-transplant-plan.md` 7번 절).
 *
 * 카드 안 순서는 시안 그대로다 — 제목·배지 / 카테고리 / 예산 / 기술 / 지원·마감.
 * 순서가 화면마다 다르면 눈으로 비교할 수 없다.
 */
export type ProjectCardProps = {
  project: PublicProjectItem;
  /** 카드에 붙일 북마크 아이콘. 넘기지 않으면 모집 상태 배지를 대신 그린다 */
  renderBookmark?: (projectId: string) => ReactNode;
};

export function ProjectCard({ project, renderBookmark }: ProjectCardProps) {
  return (
    <li className="pcard">
      <div className="pcard__top">
        <h3>
          <Link to={PROJECT_ROUTES.detail(project.projectId)}>{project.title}</Link>
        </h3>
        {renderBookmark?.(project.projectId) ?? <RecruitmentBadge status={project.recruitmentStatus} />}
      </div>

      {/* 북마크를 그리는 경우 배지가 밀려나므로 카테고리 줄 옆에 둔다 */}
      <p className="caption" style={{ margin: 0 }}>
        {project.category.displayName}
        {renderBookmark ? ' ' : null}
        {renderBookmark ? <RecruitmentBadge status={project.recruitmentStatus} /> : null}
      </p>

      <p className="pcard__budget">
        <Money amount={project.budgetAmount} />
      </p>

      <p className="pcard__skills">
        {project.skills.map((skill) => (
          <Chip key={skill.skillId} label={skill.displayName} />
        ))}
      </p>

      <div className="pcard__foot">
        <span>지원 {project.applicationCount}건</span>
        <DeadlineIndicator deadlineAt={project.recruitmentDeadlineAt} compact />
      </div>
    </li>
  );
}
