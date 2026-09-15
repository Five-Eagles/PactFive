import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { CONTRACT_ROUTES } from './contract.routes';
import { fetchContract, fetchCurrentOffer } from './api/contract';
import type { GetContractResponse } from './contract.types';
import './panel.css';

/** 프로젝트 ID만으로 현재 거래 단계의 실제 화면을 다시 여는 진입점. */
export function TransactionResumePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function resolve() {
      try {
        const current = await fetchCurrentOffer(projectId);
        if (!active) return;
        if (current.transactionStatus === 'CANCELED') {
          navigate(CONTRACT_ROUTES.cancellation(projectId), { replace: true });
          return;
        }
        if (!current.contractId) {
          navigate(CONTRACT_ROUTES.agreement(projectId), { replace: true });
          return;
        }
        const contract: GetContractResponse = await fetchContract(current.contractId);
        if (!active) return;
        if (contract.transactionStatus === 'COMPLETED') {
          navigate(CONTRACT_ROUTES.settlement(contract.contractId), { replace: true });
        } else if (contract.transactionStatus === 'IN_PROGRESS') {
          navigate(CONTRACT_ROUTES.delivery(contract.contractId), { replace: true });
        } else if (contract.status === 'SIGNING') {
          navigate(CONTRACT_ROUTES.sign(contract.contractId), { replace: true });
        } else {
          navigate(CONTRACT_ROUTES.payment(contract.contractId), { replace: true });
        }
      } catch {
        if (active) setError(true);
      }
    }
    void resolve();
    return () => { active = false; };
  }, [navigate, projectId]);

  return (
    <PageBody>
      <article className="panel">
        <div className="panel-head"><h2 className="title">거래 진행</h2></div>
        {error ? (
          <p className="status-copy">거래 진행 정보를 불러오지 못했습니다. 프로젝트 상태를 확인해 주세요.</p>
        ) : (
          <p className="helper" role="status">현재 거래 단계를 확인하는 중입니다.</p>
        )}
      </article>
    </PageBody>
  );
}
