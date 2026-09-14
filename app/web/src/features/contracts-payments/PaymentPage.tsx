import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { ApiError } from '../../shared/http';
import { PaymentPanel, type PaymentView } from './PaymentPanel';
import { CONTRACT_ROUTES } from './contract.routes';
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [prepared, setPrepared] = useState<PreparePaymentResponse | null>(null);
  const [view, setView] = useState<PaymentView>('checkout');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [tossReady, setTossReady] = useState(false);
  const confirmingRef = useRef(false);
  const paymentRequestingRef = useRef(false);

  const returnedPaymentKey = searchParams.get('paymentKey');
  const returnedOrderId = searchParams.get('orderId');
  const returnedAmount = searchParams.get('amount');
  const returnedFailCode = searchParams.get('code');

  // 결제 버튼 클릭 직전에 SDK를 로드하면 비동기 로딩으로 사용자 제스처가
  // 끊겨 결제창(popup/redirect)이 브라우저에서 차단될 수 있다. 페이지 진입
  // 시점에 미리 로드해 클릭 핸들러에서는 이미 준비된 SDK만 호출한다.
  useEffect(() => {
    loadTossSdk()
      .then(() => setTossReady(true))
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '결제 모듈을 불러오지 못했습니다.');
      });
  }, []);

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
        .catch((error: unknown) => {
          setErrorMessage(error instanceof ApiError ? error.message : '결제 승인에 실패했습니다.');
          setView('failed');
        })
        .finally(() => setLoaded(true));
      return;
    }

    preparePayment(contractId, retryToken > 0)
      .then((result) => {
        setPrepared(result);
        setErrorMessage(undefined);
        setView('checkout');
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 503) {
          setView('keyMissing');
        } else {
          setErrorMessage(error instanceof ApiError ? error.message : '결제 정보를 불러오지 못했습니다.');
          setView('failed');
        }
      })
      .finally(() => setLoaded(true));
    // returnedXxx는 첫 마운트 시점의 쿼리스트링만 본다 — Toss가 돌아올 때는 페이지가 새로 뜬다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, retryToken]);

  async function handlePay() {
    if (!prepared || paymentRequestingRef.current) return;
    if (!tossReady || !window.TossPayments) {
      setErrorMessage('결제 모듈을 아직 준비하는 중입니다. 잠시 후 다시 시도해 주세요.');
      setView('failed');
      return;
    }
    paymentRequestingRef.current = true;
    const origin = window.location.origin;
    try {
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
    } catch (error: unknown) {
      const providerMessage =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : '결제 요청을 처리하지 못했습니다.';
      console.error('[contracts-payments] Toss payment request failed', JSON.stringify({
        code: error && typeof error === 'object' && 'code' in error ? error.code : undefined,
        message: providerMessage,
        origin,
        orderId: prepared.orderId,
      }));
      setErrorMessage(providerMessage);
      setView('failed');
    } finally {
      paymentRequestingRef.current = false;
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
        errorMessage={errorMessage}
        onRetry={() => {
          setLoaded(false);
          setRetryToken((token) => token + 1);
        }}
        onContinue={() => navigate(CONTRACT_ROUTES.delivery(contractId))}
      />
    </PageBody>
  );
}
