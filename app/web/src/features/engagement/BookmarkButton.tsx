import { useState } from 'react';
import { addBookmark, removeBookmark } from './api/bookmark';

/**
 * 북마크 아이콘 — SCR-B01 카드 · SCR-B02 상세
 *
 * 원본: features/engagement/prototype/web/BookmarkButton.tsx (3e4977e)
 *
 * 보는 사람에 따라 다르게 나온다 (spec.md 규칙 30).
 *
 * | 보는 사람 | 아이콘 |
 * |---|---|
 * | 프리랜서 | 저장/해제 상태 반영 |
 * | 비로그인 | **표시하되** 누르면 로그인 유도 |
 * | 의뢰인 | **표시하지 않는다** |
 *
 * 토스트를 띄우지 않는다 (PRD D-27). 자주 누르는 동작이라 매번 뜨면 방해가 된다.
 */

export type Viewer = { role: 'CLIENT' | 'FREELANCER' } | null;

export type BookmarkButtonProps = {
  projectId: string;
  viewer: Viewer;
  initialBookmarked?: boolean;
  /** 비로그인이 눌렀을 때. 로그인 후 원래 프로젝트로 돌아와야 한다 */
  onRequireLogin?: (projectId: string) => void;
};

export function BookmarkButton({
  projectId,
  viewer,
  initialBookmarked = false,
  onRequireLogin,
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  // 의뢰인에게는 아무것도 그리지 않는다. 비활성 버튼도 두지 않는다 —
  // 있으면 "언젠가 누를 수 있는 것"으로 읽힌다.
  if (viewer?.role === 'CLIENT') return null;

  async function handleClick() {
    if (!viewer) {
      onRequireLogin?.(projectId);
      return;
    }
    const next = !bookmarked;

    // 낙관적 반영 — 아이콘을 먼저 바꾼다.
    setBookmarked(next);
    setFailed(false);
    setPending(true);
    try {
      await (next ? addBookmark(projectId) : removeBookmark(projectId));
    } catch {
      // 규칙 31 — 실패하면 **반드시 원래 상태로 되돌리고 이유를 알린다.**
      // 되돌리지 않으면 사용자는 저장됐다고 믿는다.
      setBookmarked(!next);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        className={`bookmark${bookmarked ? ' on' : ''}`}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? '북마크 해제' : '북마크 저장'}
        aria-busy={pending || undefined}
        onClick={handleClick}
      >
        {bookmarked ? '★' : '☆'}
      </button>
      {failed && (
        <span className="bookmark-error" role="alert">
          저장하지 못했습니다. 잠시 후 다시 시도해 주세요.
        </span>
      )}
    </span>
  );
}
