/**
 * SCR-B08 내 북마크
 *
 * 문구는 `design/high-fi-bookmarks.html` 의 "필수 요소 목록"을 그대로 쓴다.
 *
 * **마감된 항목을 지우지 않는다** (규칙 13). 공개 목록과 반대다 —
 * 공개 목록은 "찾는 곳"이라 지원 가능한 것만 보여주고,
 * 내 북마크는 "내가 담아둔 것"이라 내가 지우기 전엔 남는다.
 */

import { Button, Chip, EmptyState, Money, RecruitmentBadge, type RecruitmentStatus } from "./ui";

export type BookmarkCard = {
  bookmarkId: string;
  bookmarkedAt: string;
  project: {
    projectId: string;
    title: string;
    category: { category: string; displayName: string };
    budgetAmount: number;
    recruitmentDeadlineAt: string;
    recruitmentStatus: RecruitmentStatus;
    skills: { skillId: string; displayName: string }[];
    applicationCount: number;
  };
  /** 서버가 판정한다. 여기서 모집 상태로 다시 계산하지 않는다 (규칙 14) */
  canApply: boolean;
};

export type MyBookmarksProps = {
  items?: BookmarkCard[];
  onRemove?: (projectId: string) => void;
  onApply?: (projectId: string) => void;
  onBrowse?: () => void;
};

function formatSavedAt(iso: string): string {
  return `${iso.slice(0, 10).replace(/-/g, ".")} 저장`;
}

export function MyBookmarks({ items = [], onRemove, onApply, onBrowse }: MyBookmarksProps) {
  // 규칙 15 — 비어 있는 것은 오류가 아니다. 다음에 무엇을 할지 알려준다.
  if (items.length === 0) {
    return (
      <EmptyState
        title="저장한 프로젝트가 없습니다"
        body="관심 있는 프로젝트를 북마크해 두면 여기에 모여요."
        action={
          <Button variant="primary" onClick={onBrowse}>
            프로젝트 둘러보기
          </Button>
        }
      />
    );
  }

  return (
    <ul className="bookmarks">
      {items.map((item) => (
        <li key={item.bookmarkId} className={`pcard${item.canApply ? "" : " dim"}`}>
          <div className="top">
            <h3>{item.project.title}</h3>
            <RecruitmentBadge status={item.project.recruitmentStatus} />
          </div>

          <p className="budget">
            <Money amount={item.project.budgetAmount} />
          </p>
          <p className="skills">
            {item.project.skills.map((s) => (
              <Chip key={s.skillId} label={s.displayName} />
            ))}
          </p>

          <div className="foot">
            <span className="saved-at">{formatSavedAt(item.bookmarkedAt)}</span>
            <span className="btn-row">
              <Button variant="quiet" onClick={() => onRemove?.(item.project.projectId)}>
                북마크 해제
              </Button>
              {/* 마감된 것은 지원만 막는다. 문구도 이유를 말한다 —
                  회색 버튼만 두면 왜 못 누르는지 알 수 없다. */}
              <Button
                variant="primary"
                disabled={!item.canApply}
                onClick={() => onApply?.(item.project.projectId)}
              >
                {item.canApply ? "지원하기" : "모집이 마감되었습니다"}
              </Button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
