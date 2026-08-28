import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Chip,
  DeadlineIndicator,
  EmptyState,
  Money,
  RecruitmentBadge,
} from '../../shared/ui/primitives';
import { useProjectSearch } from './useProject';
import { PROJECT_ROUTES } from './project.routes';
import type { ProjectListQuery } from './project.types';

/**
 * SCR-B01 — 프로젝트 탐색
 *
 * 원본: features/project-management/prototype/web/ProjectBrowse.tsx (3e4977e)
 * 문구는 `design/high-fi-browse.html` 의 "필수 요소 목록" 9개를 그대로 쓴다.
 *
 * **거래 상태를 다루지 않는다.** 이 화면이 받는 데이터에는 그 키 자체가 없다 (규칙 9) —
 * 화면에서 숨기는 것이 아니라 서버가 안 보낸다.
 *
 * 북마크 아이콘은 engagement 소유라 여기서 import 하지 않는다. `renderBookmark` 슬롯으로
 * 받고, 실제 컴포넌트는 조립 지점인 `App.tsx` 가 끼운다 (app/web/AGENTS.md "폴더 간 접점" —
 * app/server/src/app.ts 가 서버 기능을 잇는 방식과 같다).
 * feedback_loop/2026-08-28/engagement.md 항목 3 참고.
 */

const SORTS: { value: NonNullable<ProjectListQuery['sortBy']>; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'deadline', label: '마감임박순' },
  { value: 'budget', label: '예산 높은순' },
];

export type ProjectBrowsePageProps = {
  /** 카드에 붙일 북마크 아이콘. 넘기지 않으면 아무것도 그리지 않는다 */
  renderBookmark?: (projectId: string) => ReactNode;
};

export function ProjectBrowsePage({ renderBookmark }: ProjectBrowsePageProps) {
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<NonNullable<ProjectListQuery['sortBy']>>('latest');
  // 입력할 때마다 서버를 부르지 않는다. 제출한 값만 조회 조건이 된다.
  const [submitted, setSubmitted] = useState('');

  const { data, loading, error } = useProjectSearch({
    keyword: submitted || undefined,
    sortBy,
  });

  return (
    <main className="page">
      <div className="page__head">
        <h1>프로젝트 찾기</h1>
      </div>

      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(keyword.trim());
        }}
      >
        <label className="sr-only" htmlFor="browse-search">
          프로젝트 검색
        </label>
        <input
          id="browse-search"
          type="search"
          value={keyword}
          placeholder="프로젝트를 검색해 보세요"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button variant="secondary" type="submit">
          검색
        </Button>

        <label className="sr-only" htmlFor="browse-sort">
          정렬
        </label>
        <select
          id="browse-sort"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </form>

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

      {!loading && !error && data && data.items.length === 0 && (
        <EmptyState
          title="조건에 맞는 프로젝트가 없습니다"
          body="검색어를 줄이거나 정렬을 바꿔 보세요."
        />
      )}

      {data && data.items.length > 0 && (
        <ul className="list">
          {data.items.map((project) => (
            // 도메인 패턴 ProjectCard — 비교에 필요한 항목을 늘 같은 순서로 둔다.
            // 순서가 카드마다 다르면 눈으로 비교할 수 없다.
            <li key={project.projectId} className="card">
              <div className="page__head">
                <h3 className="card__title">
                  <Link to={PROJECT_ROUTES.detail(project.projectId)}>{project.title}</Link>
                </h3>
                {renderBookmark?.(project.projectId)}
              </div>
              <p className="card__meta">{project.client.companyName ?? project.client.name}</p>
              <p className="card__meta">
                <Money amount={project.budgetAmount} />
              </p>
              <p className="card__meta">
                <DeadlineIndicator deadlineAt={project.recruitmentDeadlineAt} />
              </p>
              <p className="card__meta">
                {project.skills.map((skill) => (
                  <Chip key={skill.skillId} label={skill.displayName} />
                ))}
              </p>
              <RecruitmentBadge status={project.recruitmentStatus} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
