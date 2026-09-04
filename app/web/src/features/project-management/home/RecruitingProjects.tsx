import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../../shared/ui/primitives';
import { ProjectCard } from '../ProjectCard';
import { PROJECT_ROUTES } from '../project.routes';
import type { PublicProjectItem } from '../project.types';

/**
 * main.html "지금 모집 중인 프로젝트" — 이 화면에서 실제 API로 채워지는 유일한 자리
 * (`GET /api/v1/projects`). `ProjectBrowsePage`와 같은 카드(`ProjectCard`)를 쓴다 —
 * 하드코딩하면 대표 페이지에서 본 것과 목록에서 본 것이 달라진다(원본 주석 그대로).
 *
 * 데이터 패칭은 `HomePage.tsx`가 한다(app/web/AGENTS.md "섹션이 여러 개인 화면" 규칙 —
 * 섹션 파일은 props로 받은 것만 그린다).
 */
export type RecruitingProjectsProps = {
  items: PublicProjectItem[];
  loading: boolean;
  error: string | null;
  renderBookmark?: (projectId: string) => ReactNode;
};

export function RecruitingProjects({ items, loading, error, renderBookmark }: RecruitingProjectsProps) {
  return (
    <section className="sec">
      <div className="sec__head">
        <h3>지금 모집 중인 프로젝트</h3>
        <Link className="sec__more" to={PROJECT_ROUTES.browse}>
          전체 보기 ›
        </Link>
      </div>
      <p className="sec__note">모집 중이거나 모집 예정인 프로젝트만 보입니다. 마감된 것은 전체 보기에서 찾을 수 있습니다.</p>

      {loading && (
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      )}
      {error && (
        <p className="status-line error-line" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="지금 모집 중인 프로젝트가 없습니다" body="곧 새로운 프로젝트가 올라옵니다." />
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="grid3">
          {items.slice(0, 6).map((project) => (
            <ProjectCard key={project.projectId} project={project} renderBookmark={renderBookmark} />
          ))}
        </ul>
      )}
    </section>
  );
}
