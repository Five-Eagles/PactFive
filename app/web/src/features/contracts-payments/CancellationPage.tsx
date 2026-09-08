import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { CancellationPanel, type CancellationPanelView } from './CancellationPanel';
import { fetchCancellation } from './api/contract';
import type { GetCancellationResponse } from './contract.types';
import './panel.css';

/**
 * 취소 조회 페이지 — `/projects/:projectId/cancellation` (CAN-01 v2, spec.md 규칙 15·25,
 * 2026-09-07 팀장 반영에서 신규). agreement 화면과 같은 컨벤션으로 projectId를 URL에 쓴다.
 */
export function CancellationPage() {
  const { projectId = '' } = useParams();

  const [data, setData] = useState<GetCancellationResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');

  const load = useCallback(() => {
    setLoadState('loading');
    fetchCancellation(projectId)
      .then((result) => {
        setData(result);
        setLoadState('loaded');
      })
      .catch(() => setLoadState('failed'));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  let view: CancellationPanelView = 'loading';
  if (loadState === 'loading') view = 'loading';
  else if (loadState === 'failed') view = 'loadFailed';
  else if (data) {
    view = data.canceledAt ? 'canceled' : 'notCanceled';
  }

  return (
    <PageBody>
      <CancellationPanel view={view} data={data} onRetry={load} />
    </PageBody>
  );
}
