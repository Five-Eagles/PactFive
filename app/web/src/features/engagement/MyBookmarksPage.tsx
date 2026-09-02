import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Chip, EmptyState, Money, RecruitmentBadge } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { removeBookmark } from './api/bookmark';
import { useMyBookmarks } from './useBookmark';

/**
 * SCR-B08 — 내 북마크
 *
 * 구조 정본: `features/engagement/design/high-fi-bookmarks.html` SCR-B08
 *
 * 시안 구조: `.pcard` 목록. 카드마다 `.pcard__top`(제목 + 배지) → 예산 → 기술 →
 * `.pcard__foot`(저장 시각 · 해제/지원 버튼). 마감된 카드는 `.pcard--dim`.
 *
 * **마감된 항목을 지우지 않는다** (규칙 13). 공개 목록과 반대다 —
 * 공개 목록은 "찾는 곳"이라 지원 가능한 것만 보여주고,
 * 내 북마크는 "내가 담아둔 것"이라 내가 지우기 전엔 남는다.
 * 카드는 정상 표시하되 **지원하기만 비활성**한다 (규칙 14).
 *
 * "프로젝트 둘러보기" 링크 경로는 project-management 소유다. 그쪽 폴더를 import 할 수 없어
 * (app/web/AGENTS.md "폴더 간 접점") 호출부에서 주입받는다.
 */

export type MyBookmarksPageProps = {
  /** 프리랜서로 로그인했는가. 아니면 목록을 부르지 않는다 */
  isFreelancer: boolean;
  /** 프로젝트 탐색 화면 경로 (project-management 소유) */
  browseHref: string;
  /** 프로젝트 상세 경로를 만드는 함수 (project-management 소유) */
  detailHref: (projectId: string) => string;
};

function formatSavedAt(iso: string): string {
  return `${iso.slice(0, 10).replace(/-/g, '.')} 저장`;
}

export function MyBookmarksPage({ isFreelancer, browseHref, detailHref }: MyBookmarksPageProps) {
  const { data, loading, error, reload } = useMyBookmarks(isFreelancer);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function handleRemove(projectId: string) {
    setRemoveError(null);
    try {
      await removeBookmark(projectId);
      reload();
    } catch (failure) {
      setRemoveError(
        failure instanceof ApiError ? failure.message : '북마크를 해제하지 못했습니다.',
      );
    }
  }

  if (!isFreelancer) {
    return (
      <PageBody>
        <EmptyState
          title="프리랜서만 사용할 수 있습니다"
          body="북마크는 프리랜서가 관심 있는 프로젝트를 담아두는 기능입니다."
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <h1 className="h3">내 북마크</h1>

      {loading && (
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      )}

      {(error || removeError) && (
        <p className="status-line error-line" role="alert">
          {removeError ?? error}
        </p>
      )}

      {/* 규칙 15 — 비어 있는 것은 오류가 아니다. 다음에 무엇을 할지 알려준다. */}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState
          title="저장한 프로젝트가 없습니다"
          body="관심 있는 프로젝트를 북마크해 두면 여기에 모여요."
          action={
            <Link to={browseHref}>
              <Button variant="primary">프로젝트 둘러보기</Button>
            </Link>
          }
        />
      )}

      {data && data.length > 0 && (
        <ul className="grid">
          {data.map((item) => (
            <li
              key={item.bookmarkId}
              className={`pcard${item.canApply ? '' : ' pcard--dim'}`}
            >
              <div className="pcard__top">
                <h3>
                  <Link to={detailHref(item.project.projectId)}>{item.project.title}</Link>
                </h3>
                <RecruitmentBadge status={item.project.recruitmentStatus} />
              </div>

              <p className="pcard__budget">
                <Money amount={item.project.budgetAmount} />
              </p>

              <p className="pcard__skills">
                {item.project.skills.map((skill) => (
                  <Chip key={skill.skillId} label={skill.displayName} />
                ))}
              </p>

              <div className="pcard__foot">
                <span className="saved-at">{formatSavedAt(item.bookmarkedAt)}</span>
                <span className="btn-row">
                  <Button variant="quiet" size="sm" onClick={() => void handleRemove(item.project.projectId)}>
                    북마크 해제
                  </Button>
                  {/* 마감된 것은 지원만 막는다. 문구도 이유를 말한다 —
                      회색 버튼만 두면 왜 못 누르는지 알 수 없다. */}
                  <Button variant="primary" size="sm" disabled={!item.canApply}>
                    {item.canApply ? '지원하기' : '모집이 마감되었습니다'}
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
