import { Route } from 'react-router-dom';
import { AgreementPage } from './AgreementPage';
import { ContractSignPage } from './ContractSignPage';
import { PaymentPage } from './PaymentPage';
import { DeliveryPage } from './DeliveryPage';
import { SettlementPage } from './SettlementPage';
import { CancellationPage } from './CancellationPage';

/**
 * contracts-payments 라우트 정의 + 경로 상수.
 *
 * 세 패널(합의·서명·결제)은 "패널만 · 앱 셸 없음"이 시안의 원칙이지만(design/*.html 상단
 * `.meta` 문구), 실제 앱에서는 다른 화면과 마찬가지로 AppShell(로고+nav) 안에 들어간다 —
 * `PageBody`로만 감싸고 새 앱 셸을 만들지 않는다.
 *
 * URL 모양은 api-contract.md가 고정한 게 아니라 이 반영에서 처음 정했다 — 결제·정산 화면은
 * paymentId가 계약에서 자동으로 만들어지므로 URL에 넣지 않고 contractId로 접근한다.
 *
 * 2026-09-07 팀장 반영 — 납품(DLV-01)·정산 조회(SET-01 v2)·취소 조회(CAN-01 v2) 3개 신규
 * 화면을 추가했다. 납품은 서명·결제와 같은 contractId 축, 정산도 같은 축(SettlementPage
 * 상단 주석 참고), 취소는 합의와 같은 projectId 축을 쓴다 — 각 공개 API가 무엇으로 조회하는지
 * 그대로 따른 것이다.
 */
export const CONTRACT_ROUTES = {
  agreement: (projectId: string) => `/projects/${projectId}/agreements`,
  sign: (contractId: string) => `/contracts/${contractId}/sign`,
  payment: (contractId: string) => `/contracts/${contractId}/payment`,
  delivery: (contractId: string) => `/contracts/${contractId}/delivery`,
  settlement: (contractId: string) => `/contracts/${contractId}/settlement`,
  cancellation: (projectId: string) => `/projects/${projectId}/cancellation`,
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
      <Route path="/contracts/:contractId/delivery" element={<DeliveryPage />} />
      <Route path="/contracts/:contractId/settlement" element={<SettlementPage />} />
      <Route path="/projects/:projectId/cancellation" element={<CancellationPage />} />
    </>
  );
}
