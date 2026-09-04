import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { ApiError } from '../../shared/http';
import { PaymentPanel, type PaymentView } from './PaymentPanel';
import { confirmPayment, preparePayment } from './api/contract';
import type { PreparePaymentResponse } from './contract.types';
import './panel.css';

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (
        method: string,
        options: {
          amount: number;
          orderId: string;
          orderName: string;
          successUrl: string;
          failUrl: string;
        },
      ) => Promise<void>;
    };
  }
}

const TOSS_SDK_URL = 'https://js.tosspayments.com/v1/payment';
let tossSdkPromise: Promise<void> | null = null;

/** Toss SDK를 CDN에서 한 번만 불러온다 — 패키지 의존성을 추가하지 않는다. */
function loadTossSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  if (tossSdkPromise) return tossSdkPromise;
  tossSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TOSS_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('결제 모듈을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
  return tossSdkPromise;
}

/**
 * 결제 페이지 — `/projects/:projectId/contracts/:contractId/payment`.
 *
 * Toss Payments 표준 결제창으로 리다이렉트했다가 `successUrl`/`failUrl`로 같은 페이지에
 * 돌아온다 — 실제 Toss 연동 방식 그대로다(위젯 임베드가 아니라 호스팅 결제창).
 * 돌아왔을 때는 쿼리스트링의 `paymentKey`·`orderId`·`amount`(성공) 또는 `code`·`message`(실패)로
 * 판별한다.
 */
export function PaymentPage() {
  const { contractId = '' } = useParams();
  const [searchParams] = useSearchParams();

  const [prepared, setPrepared] = useState<PreparePaymentResponse | null>(null);
  const [view, setView] = useState<PaymentView>('checkout');
  const [loaded, setLoaded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const confirmingRef = useRef(false);

  const returnedPaymentKey = searchParams.get('paymentKey');
  const returnedOrderId = searchParams.get('orderId');
  const returnedAmount = searchParams.get('amount');
  const returnedFailCode = searchParams.get('code');

  useEffect(() => {
    if (returnedFailCode) {
      setView('failed');
      setLoaded(true);
      return;
    }
    if (returnedPaymentKey && returnedOrderId && returnedAmount) {
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      setView('pending');
      confirmPayment({
        orderId: returnedOrderId,
        amount: Number(returnedAmount),
        paymentKey: returnedPaymentKey,
      })
        .then(() => setView('paid'))
        .catch(() => setView('failed'))
        .finally(() => setLoaded(true));
      return;
    }

    preparePayment(contractId)
      .then((result) => {
        setPrepared(result);
        setView('checkout');
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 503) {
          setView('keyMissing');
        } else {
          setView('failed');
        }
      })
      .finally(() => setLoaded(true));
    // returnedXxx는 첫 마운트 시점의 쿼리스트링만 본다 — Toss가 돌아올 때는 페이지가 새로 뜬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, retryToken]);

  async function handlePay() {
    if (!prepared) return;
    try {
      await loadTossSdk();
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const toss = window.TossPayments?.(prepared.clientKey);
      if (!toss) {
        setView('failed');
        return;
      }
      await toss.requestPayment('카드', {
        amount: prepared.amount,
        orderId: prepared.orderId,
        orderName: '프로젝트 결제',
        successUrl: `${origin}${pathname}`,
        failUrl: `${origin}${pathname}`,
      });
      // requestPayment는 브라우저를 Toss 결제창으로 이동시킨다 — 이 아래는 보통 실행되지 않는다.
    } catch {
      setView('failed');
    }
  }

  if (!loaded) {
    return (
      <PageBody>
        <article className="panel" aria-busy="true">
          <div className="panel-head">
            <h2 className="title">결제</h2>
          </div>
          <p className="helper">결제 정보를 불러오는 중입니다.</p>
          <div className="skeleton" />
        </article>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PaymentPanel
        view={view}
        amount={prepared?.amount}
        projectTitle="프로젝트"
        onPay={handlePay}
        onRetry={() => {
          setLoaded(false);
          setRetryToken((token) => token + 1);
        }}
      />
    </PageBody>
  );
}
