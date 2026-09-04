import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/http';
import { fetchBookmarkedProjectIds, fetchMyBookmarks, fetchRecommendations } from './api/bookmark';
import type { BookmarkItem, RecommendedItem } from './bookmark.types';

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
export function useRecommendations(projectId: string): RecommendedItem[] {
  const [items, setItems] = useState<RecommendedItem[]>([]);

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

/**
 * 로그인한 프리랜서가 저장한 프로젝트 id 집합 (CR-0008).
 *
 * project-management 카드에 북마크 초기 상태(`initialBookmarked`)를 넘길 때 쓴다 — 연결은
 * `App.tsx` 의 `renderBookmark` 슬롯이 한다(두 기능 폴더는 서로를 import 하지 않는다).
 *
 * **의뢰인·비로그인이면 아무것도 부르지 않는다.** 서버가 401·403 을 주기 전에 화면에서
 * 막는다 — 실패를 기다렸다가 빈 Set 으로 처리하지 않는다.
 */
export function useBookmarkedIds(enabled: boolean): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setIds(new Set());
      return;
    }
    let alive = true;
    fetchBookmarkedProjectIds()
      .then((response) => {
        if (alive) setIds(new Set(response.projectIds));
      })
      .catch(() => {
        // 대조에 실패해도 화면을 막지 않는다 — 북마크 아이콘이 전부 비어 보일 뿐이다.
        if (alive) setIds(new Set());
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return ids;
}
