import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { ContractSignPanel, type ContractSignView } from './ContractSignPanel';
import { fetchContract, signContract } from './api/contract';
import type { GetContractResponse } from './contract.types';
import { CONTRACT_ROUTES } from './contract.routes';
import './panel.css';

/** 계약 서명 페이지 — `/contracts/:contractId/sign`. */
export function ContractSignPage({ viewerRole }: { viewerRole: 'CLIENT' | 'FREELANCER' | null }) {
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
    // 계약 응답은 양쪽 서명 시각을 모두 주므로 현재 로그인 역할의 시각만 본다.
    // 한쪽만 서명한 경우 서명하지 않은 쪽에는 반드시 서명 버튼이 보여야 한다.
    const mySignedAt = viewerRole === 'CLIENT' ? data.clientSignedAt : data.freelancerSignedAt;
    view = mySignedAt ? 'waiting' : 'ready';
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
