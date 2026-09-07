import { Route } from 'react-router-dom';
import { AgreementPage } from './AgreementPage';
import { ContractSignPage } from './ContractSignPage';
import { PaymentPage } from './PaymentPage';

/**
 * contracts-payments 라우트 정의 + 경로 상수.
 *
 * 세 패널(합의·서명·결제)은 "패널만 · 앱 셸 없음"이 시안의 원칙이지만(design/*.html 상단
 * `.meta` 문구), 실제 앱에서는 다른 화면과 마찬가지로 AppShell(로고+nav) 안에 들어간다 —
 * `PageBody`로만 감싸고 새 앱 셸을 만들지 않는다.
 *
 * URL 모양은 api-contract.md가 고정한 게 아니라 이 반영에서 처음 정했다 — 결제 화면은
 * paymentId가 계약에서 자동으로 만들어지므로 URL에 넣지 않고 contractId로 접근한다.
 */
export const CONTRACT_ROUTES = {
  agreement: (projectId: string) => `/projects/${projectId}/agreements`,
  sign: (contractId: string) => `/contracts/${contractId}/sign`,
  payment: (contractId: string) => `/contracts/${contractId}/payment`,
} as const;

export type ContractRouteProps = {
  viewerId: string | null;
};

export function contractRoutes({ viewerId }: ContractRouteProps) {
  return (
    <>
      <Route path="/projects/:projectId/agreements" element={<AgreementPage viewerId={viewerId} />} />
      <Route path="/contracts/:contractId/sign" element={<ContractSignPage />} />
      <Route path="/contracts/:contractId/payment" element={<PaymentPage />} />
    </>
  );
}
