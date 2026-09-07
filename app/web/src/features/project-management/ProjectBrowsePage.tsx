import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, EmptyState } from '../../shared/ui/primitives';
import { useProjectSearch } from './useProject';
import { ProjectCard } from './ProjectCard';
import type { ProjectListQuery } from './project.types';

/**
 * SCR-B01 — 프로젝트 탐색
 *
 * 구조 정본: `features/project-management/design/high-fi-browse.html` SCR-B01
 * 문구 정본: 같은 파일의 "필수 요소 목록" (PRD §14)
 *
 * 시안 구조: `.toolbar`(검색 + 필터 + `.sorts` 3버튼) → `.grid.cols3` 의 `.pcard` → `.pager`.
 * 카드 안 순서도 시안 그대로다 — 제목·배지 / 카테고리 / 예산 / 기술 / 지원·마감.
 * 순서가 카드마다 다르면 눈으로 비교할 수 없다 (도메인 패턴 ProjectCard).
 *
 * **거래 상태를 다루지 않는다.** 이 화면이 받는 데이터에는 그 키 자체가 없다 (규칙 9) —
 * 화면에서 숨기는 것이 아니라 서버가 안 보낸다.
 *
 * 북마크 아이콘은 engagement 소유라 여기서 import 하지 않는다. `renderBookmark` 슬롯으로
 * 받고 실제 컴포넌트는 조립 지점인 `App.tsx` 가 끼운다.
 */

const SORTS: { value: NonNullable<ProjectListQuery['sortBy']>; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'deadline', label: '마감임박순' },
  { value: 'budget', label: '예산 높은순' },
];

const PAGE_SIZE = 9; // 3열 × 3행 — 시안의 cols3 그리드에 맞춘다

export type ProjectBrowsePageProps = {
  /** 카드에 붙일 북마크 아이콘. 넘기지 않으면 아무것도 그리지 않는다 */
  renderBookmark?: (projectId: string) => ReactNode;
};

export function ProjectBrowsePage({ renderBookmark }: ProjectBrowsePageProps) {
  // 대표 페이지 히어로 검색·인기 검색어가 `?keyword=`로 넘어온다(features/project-management/
  // home/Hero.tsx). 최초 진입 값만 읽는다 — 이후 사용자가 이 화면 안에서 검색하면 URL은
  // 갱신하지 않는다(2026-08-28 원안 그대로, 뒤로가기 히스토리를 늘리지 않기 위해서다).
  const [initialParams] = useSearchParams();
  const initialKeyword = initialParams.get('keyword') ?? '';
  // 대표 페이지 카테고리 10종(home/CategoryGrid.tsx)이 `?category=`로 넘어온다. 필터 UI 자체는
  // 아직 없어(2026-08-28 feedback_loop 항목 6, 이번 통합 범위 밖) 최초 진입 값만 그대로 건다.
  const initialCategory = initialParams.get('category') ?? undefined;
  const [keyword, setKeyword] = useState(initialKeyword);
  const [sortBy, setSortBy] = useState<NonNullable<ProjectListQuery['sortBy']>>('latest');
  // 입력할 때마다 서버를 부르지 않는다. 제출한 값만 조회 조건이 된다.
  const [submitted, setSubmitted] = useState(initialKeyword);
  const [page, setPage] = useState(1);

  const { data, loading, error } = useProjectSearch({
    keyword: submitted || undefined,
    category: initialCategory,
    sortBy,
    page,
    pageSize: PAGE_SIZE,
  });

  function search(next: string) {
    setSubmitted(next);
    setPage(1); // 조건이 바뀌면 1페이지부터 — 3페이지에서 검색하면 빈 화면이 나온다
  }

  function changeSort(value: NonNullable<ProjectListQuery['sortBy']>) {
    setSortBy(value);
    setPage(1);
  }

  const isEmpty = !loading && !error && data !== null && data.items.length === 0;

  return (
    <PageBody>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          search(keyword.trim());
        }}
      >
        <label className="sr-only" htmlFor="browse-search">
          프로젝트 검색
        </label>
        <input
          id="browse-search"
          className="field"
          type="search"
          value={keyword}
          placeholder="프로젝트를 검색해 보세요"
          onChange={(event) => setKeyword(event.target.value)}
        />
        {/* 시안의 "필터" 버튼. 필터 화면은 아직 없어 검색 제출로 동작한다 —
            feedback_loop/2026-08-28/project-management.md 항목 6 */}
        <Button variant="secondary" type="submit">
          필터
        </Button>

        <div className="sorts" role="group" aria-label="정렬">
          {SORTS.map((sort) => (
            <button
              key={sort.value}
              type="button"
              className={sortBy === sort.value ? 'on' : undefined}
              aria-pressed={sortBy === sort.value}
              onClick={() => changeSort(sort.value)}
            >
              {sort.label}
            </button>
          ))}
        </div>
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

      {isEmpty && (
        <EmptyState
          title="조건에 맞는 프로젝트가 없습니다"
          body="검색어나 필터를 조정해 보세요."
          action={
            submitted ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setKeyword('');
                  search('');
                }}
              >
                필터 초기화
              </Button>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="grid grid--cols3">
            {data.items.map((project) => (
              <ProjectCard key={project.projectId} project={project} renderBookmark={renderBookmark} />
            ))}
          </ul>

          {data.totalPages > 1 && (
            <nav className="pager" aria-label="페이지">
              {Array.from({ length: data.totalPages }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  className={number === data.page ? 'on' : undefined}
                  aria-current={number === data.page ? 'page' : undefined}
                  onClick={() => setPage(number)}
                >
                  {number}
                </button>
              ))}
            </nav>
          )}
        </>
      )}
    </PageBody>
  );
}
