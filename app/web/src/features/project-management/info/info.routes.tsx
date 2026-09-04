import { Route } from 'react-router-dom';
import { INFO_ROUTES } from './info.paths';
import { GuidePage } from './GuidePage';
import { SafetyPage } from './SafetyPage';
import { PolicyPage } from './PolicyPage';

/**
 * 안내 화면 — 이용 방법 · 안전한 거래 · 약관 · 개인정보 · 고객센터.
 *
 * **`ComingSoonOverlay` 로 감싸지 않는다.** 이 화면들이 하는 일은 이미 정해진 것을
 * 설명하는 것뿐이라 서버도 데이터도 필요 없다 — 즉 **이미 완성된 화면이다.**
 * 완성된 것에 "준비 중" 을 덮으면 거짓말이 된다.
 *
 * 약관·개인정보·고객센터는 내용이 아직 확정되지 않았다. 그것은 화면이 직접 말한다
 * (`PolicyPage` 의 안내 상자) — 문서가 미완인 것과 화면이 없는 것은 다르다.
 *
 * 전문가 찾기(`preview/`)와 다른 점이 여기다. 그쪽은 만들지 말지조차 정해지지 않아
 * 블러 뒤에 둔다.
 */
export function infoRoutes() {
  return (
    <>
      <Route path={INFO_ROUTES.guide} element={<GuidePage />} />
      <Route path={INFO_ROUTES.safety} element={<SafetyPage />} />
      <Route path={INFO_ROUTES.terms} element={<PolicyPage policy="terms" />} />
      <Route path={INFO_ROUTES.privacy} element={<PolicyPage policy="privacy" />} />
      <Route path={INFO_ROUTES.support} element={<PolicyPage policy="support" />} />
    </>
  );
}

export { INFO_ROUTES };
