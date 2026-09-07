import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { ContractSignPanel, type ContractSignView } from './ContractSignPanel';
import { fetchContract, signContract } from './api/contract';
import type { GetContractResponse } from './contract.types';
import { CONTRACT_ROUTES } from './contract.routes';
import './panel.css';

/** 계약 서명 페이지 — `/contracts/:contractId/sign`. */
export function ContractSignPage() {
  const { contractId = '' } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<GetContractResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoadState('loading');
    fetchContract(contractId)
      .then((result) => {
        setData(result);
        setLoadState('loaded');
      })
      .catch(() => setLoadState('failed'));
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  // 양쪽 다 서명하면(SIGNED) 결제 화면으로 넘어간다.
  useEffect(() => {
    if (data?.status === 'SIGNED') {
      navigate(CONTRACT_ROUTES.payment(contractId), { replace: true });
    }
  }, [data?.status, navigate, contractId]);

  async function handleSign() {
    setSubmitting(true);
    try {
      const result = await signContract(contractId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              status: result.status,
              clientSignedAt: result.clientSignedAt,
              freelancerSignedAt: result.freelancerSignedAt,
              signedAt: result.signedAt,
            }
          : prev,
      );
    } catch {
      // 실패는 화면을 바꾸지 않는다 — 다시 시도할 수 있게 그대로 둔다.
    } finally {
      setSubmitting(false);
    }
  }

  let view: ContractSignView = 'loading';
  if (loadState === 'loading') view = 'loading';
  else if (loadState === 'failed') view = 'loadFailed';
  else if (data?.status === 'CANCELED') view = 'canceled';
  else if (data?.status === 'SIGNING') {
    // 내가 이미 서명했는지는 GetContractResponse에 사용자별 서명 여부가 따로 없어(시각만 있다)
    // "누군가 한쪽은 서명했다"로 근사한다 — 내가 아직 안 한 쪽이면 다음 서명 클릭이 그대로
    // 내 서명으로 기록된다(서버가 실제 판정).
    view = data.clientSignedAt || data.freelancerSignedAt ? 'waiting' : 'ready';
  } else {
    view = 'ready';
  }

  return (
    <PageBody>
      <ContractSignPanel
        view={view}
        amount={data?.termsSnapshot.amount}
        projectTitle={data?.termsSnapshot.projectTitle || '프로젝트'}
        onSign={handleSign}
        onRetry={load}
        submitting={submitting}
      />
    </PageBody>
  );
}
