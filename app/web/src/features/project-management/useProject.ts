import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/http';
import { fetchMyProjects, fetchProject, searchProjects } from './api/project';
import type {
  ClientProjectDetail,
  ProjectListQuery,
  ProjectListResponse,
  PublicProjectDetail,
} from './project.types';

/**
 * project-management 조회 훅.
 *
 * 데이터 패칭 라이브러리를 두지 않는다 — 앱 전체가 아직 쓰지 않고, 이 기능 하나 때문에
 * 도입하는 것은 팀 규모 대비 과한 선제 작업이다 (constitution 원칙 6).
 * 필요해지면 `shared/` 로 올려 한 번에 바꾼다.
 */

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  /** 사용자에게 그대로 보여줄 문구. 서버가 준 message 를 쓴다 */
  error: string | null;
};

const IDLE = { data: null, loading: true, error: null } as const;

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** A-02 목록. `query` 가 바뀔 때마다 다시 부른다 */
export function useProjectSearch(query: ProjectListQuery): AsyncState<ProjectListResponse> {
  const [state, setState] = useState<AsyncState<ProjectListResponse>>(IDLE);
  const key = JSON.stringify(query);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    searchProjects(query)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          data: null,
          loading: false,
          error: toMessage(error, '프로젝트를 불러오지 못했습니다.'),
        });
      });

    return () => controller.abort();
    // query 객체는 렌더마다 새로 만들어지므로 직렬화한 값으로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** A-03 상세. 등록 의뢰인이면 서버가 ClientProjectDetail 을 준다 (규칙 9) */
export function useProject(projectId: string): AsyncState<PublicProjectDetail | ClientProjectDetail> {
  const [state, setState] = useState<AsyncState<PublicProjectDetail | ClientProjectDetail>>(IDLE);

  useEffect(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetchProject(projectId)
      .then((data) => {
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState({
          data: null,
          loading: false,
          error: toMessage(error, '프로젝트를 불러오지 못했습니다.'),
        });
      });

    return () => {
      alive = false;
    };
  }, [projectId]);

  return state;
}

/** A-08 내 프로젝트. 행동(마감·취소 등) 뒤에 목록을 다시 읽을 수 있게 `reload` 를 준다 */
export function useMyProjects(clientId: string | null) {
  const [state, setState] = useState<AsyncState<ClientProjectDetail[]>>(IDLE);

  const reload = useCallback(() => {
    if (!clientId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchMyProjects(clientId)
      .then((response) => setState({ data: response.items, loading: false, error: null }))
      .catch((error: unknown) =>
        setState({
          data: null,
          loading: false,
          error: toMessage(error, '내 프로젝트를 불러오지 못했습니다.'),
        }),
      );
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

/** 서버가 `ClientProjectDetail` 을 줬는지(= 내가 등록한 프로젝트인지) 판정한다 */
export function isClientDetail(
  detail: PublicProjectDetail | ClientProjectDetail | null,
): detail is ClientProjectDetail {
  return detail !== null && 'availableActions' in detail;
}
