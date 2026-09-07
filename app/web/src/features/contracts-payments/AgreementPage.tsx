import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { ApiError } from '../../shared/http';
import { AgreementPanel, type AgreementView } from './AgreementPanel';
import { acceptOffer, fetchCurrentOffer, proposeOffer, rejectOffer } from './api/contract';
import type { CurrentNegotiationOfferResponse } from './contract.types';
import { CONTRACT_ROUTES } from './contract.routes';
import './panel.css';

/**
 * 금액 합의 페이지 — `/projects/:projectId/agreements`.
 *
 * `AgreementPanel`은 순수 표시 컴포넌트다. 이 페이지가 조회·제출을 붙인다
 * (project-management의 ProjectDetailPage ↔ useProject 관계와 같은 역할 분담).
 *
 * **알려진 범위 제한**: 프로젝트 제목을 이 기능이 직접 갖고 있지 않다 — 내부 계약
 * `getProjectNegotiationContext`(project-management 소유)가 제목을 주지 않는다. 지금은
 * 자리표시자 "프로젝트"를 쓴다. feedback_loop/2026-09-03/contracts-payments.md 참고.
 */
export function AgreementPage({ viewerId }: { viewerId: string | null }) {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<CurrentNegotiationOfferResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed' | 'stale'>('loading');
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoadState('loading');
    fetchCurrentOffer(projectId)
      .then((result) => {
        setData(result);
        setLoadState('loaded');
      })
      .catch(() => setLoadState('failed'));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // 합의가 이미 성사돼 계약이 생겼으면 서명 화면으로 넘어간다.
  useEffect(() => {
    if (data?.contractId) {
      navigate(CONTRACT_ROUTES.sign(data.contractId), { replace: true });
    }
  }, [data?.contractId, navigate]);

  async function handlePropose() {
    const amount = Number(amountInput.replace(/[^0-9]/g, ''));
    if (!amount || amount <= 0) {
      setAmountError('금액을 입력해 주세요.');
      return;
    }
    setAmountError(null);
    setSubmitting(true);
    try {
      const result = await proposeOffer(projectId, amount);
      setData(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROJECT_TRANSITION_CONFLICT') {
        setLoadState('stale');
      } else {
        setAmountError(error instanceof ApiError ? error.message : '제안을 보내지 못했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!data?.offer) return;
    setSubmitting(true);
    try {
      const result = await acceptOffer(projectId, data.offer.offerId, data.offer.round);
      setData(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROJECT_TRANSITION_CONFLICT') {
        setLoadState('stale');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(reasonCode: string) {
    if (!data?.offer) return;
    setSubmitting(true);
    try {
      const result = await rejectOffer(projectId, data.offer.offerId, reasonCode);
      setData(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROJECT_TRANSITION_CONFLICT') {
        setLoadState('stale');
      }
    } finally {
      setSubmitting(false);
    }
  }

  let view: AgreementView = 'loading';
  if (loadState === 'loading') view = 'loading';
  else if (loadState === 'failed') view = 'loadFailed';
  else if (loadState === 'stale') view = 'stale';
  else if (data) {
    if (data.agreementStatus === 'PROPOSED' && data.offer) {
      view = data.offer.offeredByUserId === viewerId ? 'proposed' : 'respond';
    } else {
      view = 'create';
    }
  }

  return (
    <PageBody>
      <AgreementPanel
        view={view}
        amount={data?.offer?.amount}
        projectTitle="프로젝트"
        amountInput={amountInput}
        amountError={amountError}
        onAmountChange={(value) => {
          setAmountInput(value);
          setAmountError(null);
        }}
        onPropose={handlePropose}
        onAccept={handleAccept}
        onReject={handleReject}
        onRetry={load}
        submitting={submitting}
      />
    </PageBody>
  );
}
