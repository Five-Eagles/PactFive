import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { DeliveryPanel, type DeliveryPanelView } from './DeliveryPanel';
import { fetchDelivery, prepareDeliveryUpload, requestDelivery, approveDelivery } from './api/contract';
import type { GetDeliveryResponse } from './contract.types';
import './panel.css';

/**
 * 납품 페이지 — `/projects/:projectId/contracts/:contractId/delivery` (DLV-01, spec.md 규칙
 * 17·23, 2026-09-07 팀장 반영에서 신규).
 *
 * 실저장소·실AV는 스텁이다(api-contract.md) — 여기서는 브라우저의 `crypto.subtle`로 실제
 * SHA-256을 계산해 서버 검증(`^[0-9a-f]{64}$`)을 통과시키되, `uploadUrl`로의 실제 PUT은
 * 하지 않는다(서버가 반환하는 URL 자체가 `https://uploads.invalid/...` 자리표시자다).
 */
export function DeliveryPage() {
  const { contractId = '' } = useParams();

  const [data, setData] = useState<GetDeliveryResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoadState('loading');
    fetchDelivery(contractId)
      .then((result) => {
        setData(result);
        setLoadState('loaded');
      })
      .catch(() => setLoadState('failed'));
  }, [contractId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sha256Hex(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function handleRequestDelivery() {
    if (!selectedFile) return;
    setSubmitting(true);
    try {
      const sha256 = await sha256Hex(selectedFile);
      const prepared = await prepareDeliveryUpload(contractId, {
        fileName: selectedFile.name,
        contentType: selectedFile.type || 'application/octet-stream',
        size: selectedFile.size,
        sha256,
      });
      const result = await requestDelivery(
        contractId,
        { objectKey: prepared.objectKey, uploadId: prepared.uploadId, message },
        crypto.randomUUID(),
      );
      setData(result);
    } catch {
      // 실패는 화면을 바꾸지 않는다 — 다시 시도할 수 있게 그대로 둔다.
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    setSubmitting(true);
    try {
      const result = await approveDelivery(contractId, crypto.randomUUID());
      setData(result);
    } catch {
      // 실패는 화면을 바꾸지 않는다.
    } finally {
      setSubmitting(false);
    }
  }

  let view: DeliveryPanelView = 'loading';
  if (loadState === 'loading') view = 'loading';
  else if (loadState === 'failed') view = 'loadFailed';
  else if (data) {
    if (data.transactionStatus === 'CANCELED' || data.canceledAt) {
      view = 'canceled';
    } else if (data.delivery?.status === 'APPROVED') {
      view = 'approved';
    } else if (data.delivery?.status === 'DELIVERY_REQUESTED') {
      view = data.canApprove ? 'clientReview' : 'freelancerWaiting';
    } else {
      view = data.canRequestDelivery ? 'freelancerUpload' : 'clientWaiting';
    }
  }

  return (
    <PageBody>
      <DeliveryPanel
        view={view}
        projectTitle={data?.projectTitle || '프로젝트'}
        delivery={data?.delivery}
        downloadUrl={data?.downloadUrl}
        canReview={data?.canReview}
        selectedFileName={selectedFile?.name ?? null}
        message={message}
        onMessageChange={setMessage}
        onSelectFile={setSelectedFile}
        onRequestDelivery={handleRequestDelivery}
        onApprove={handleApprove}
        onRetry={load}
        submitting={submitting}
      />
    </PageBody>
  );
}
