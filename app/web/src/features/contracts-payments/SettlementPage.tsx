import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { SettlementPanel, type SettlementPanelView } from './SettlementPanel';
import { fetchSettlement, preparePayment } from './api/contract';
import type { GetSettlementResponse } from './contract.types';
import './panel.css';

/**
 * 정산 조회 페이지 — `/contracts/:contractId/settlement` (SET-01 v2, spec.md 규칙 24,
 * 2026-09-07 팀장 반영에서 신규).
 *
 * 공개 GET 경로가 `/v1/payments/:paymentId/settlement`라 paymentId가 있어야 하는데,
 * 결제·서명 화면과 같은 컨벤션(contract.routes.tsx 상단 주석)대로 URL에는 paymentId를
 * 넣지 않고 contractId로 접근한다. paymentId는 `preparePayment`가 READY/PAID 상태에서
 * **부작용 없이(기존 레코드 그대로 반환)** 항상 같은 값을 돌려주므로(public-api.service.ts
 * `preparePayment` — existing.status가 READY|PAID면 게이트웨이 호출 없이 즉시 반환) 이를
 * paymentId 조회 수단으로 재사용했다. PENDING/미결제 상태면 409로 실패해 loadFailed로
 * 떨어진다 — 이 화면은 결제 완료 이후에만 링크되므로 실사용 경로에서는 발생하지 않는다.
 */
export function SettlementPage() {
  const { contractId = '' } = useParams();

  const [data, setData] = useState<GetSettlementResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');

  const load = useCallback(() => {
    setLoadState('loading');
    preparePayment(contractId)
      .then((prepared) => fetchSettlement(prepared.paymentId))
      .then((result) => {
        setData(result);
        setLoadState('loaded');
      })
      .catch(() => setLoadState('failed'));
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  let view: SettlementPanelView = 'loading';
  if (loadState === 'loading') view = 'loading';
  else if (loadState === 'failed') view = 'loadFailed';
  else if (data) {
    view = data.projectTransactionStatus === 'CANCELED' || data.canceledAt ? 'canceled' : 'ready';
  }

  return (
    <PageBody>
      <SettlementPanel view={view} data={data} onRetry={load} />
    </PageBody>
  );
}
