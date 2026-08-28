import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/http';
import { fetchMyBookmarks, fetchRecommendations } from './api/bookmark';
import type { BookmarkItem, BookmarkedProject } from './bookmark.types';

/**
 * engagement 조회 훅.
 *
 * project-management 의 `useProject.ts` 와 같은 모양이다. 두 파일이 비슷하지만 아직
 * `shared/` 로 올리지 않는다 — 같은 것이 세 번째로 필요해질 때 올린다
 * (app/web/AGENTS.md: 두 번째면 올릴 만하지만, 여기서는 훅의 내부 상태 모양만 닮았고
 * 공유할 실제 로직이 없어 `shared/` 만 비대해진다).
 */

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** 내 북마크 목록. 해제한 뒤 다시 읽을 수 있게 `reload` 를 준다 */
export function useMyBookmarks(enabled: boolean) {
  const [state, setState] = useState<AsyncState<BookmarkItem[]>>({
    data: null,
    loading: enabled,
    error: null,
  });

  const reload = useCallback(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchMyBookmarks()
      .then((response) => setState({ data: response.items, loading: false, error: null }))
      .catch((error: unknown) =>
        setState({
          data: null,
          loading: false,
          error: toMessage(error, '북마크를 불러오지 못했습니다.'),
        }),
      );
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

/**
 * 추천 프로젝트.
 *
 * 실패해도 화면을 막지 않는다 — 보조 섹션이라 빈 목록으로 두고 섹션을 감춘다 (규칙 24).
 * 상세 화면 전체가 추천 때문에 오류로 보이면 안 된다.
 */
export function useRecommendations(projectId: string): BookmarkedProject[] {
  const [items, setItems] = useState<BookmarkedProject[]>([]);

  useEffect(() => {
    let alive = true;
    fetchRecommendations(projectId)
      .then((response) => {
        if (alive) setItems(response.items);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  return items;
}
