/**
 * 아직 설계/통합되지 않은 기능의 라우트에 들어왔을 때 보여주는 공용 안내 화면.
 *
 * `NotFoundPage`(App.tsx, 진짜 404 — 경로 자체가 없음)와는 다르다. 이 컴포넌트는 "경로는
 * 등록돼 있지만 화면 구현이 아직 없다"는 뜻이다 — project-management·applications·ai-pricing·
 * reviews·engagement·notifications, 그리고 contracts-payments의 웹 화면(서버만 이번에 반영됨)이
 * 여기 해당한다.
 */
type NotIntegratedPageProps = {
  /** 실제 기능 한글명 또는 폴더명. 문구에 그대로 노출된다. */
  featureName: string;
};

export function NotIntegratedPage({ featureName }: NotIntegratedPageProps) {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>{featureName}</h1>
      <p role="status">{featureName}은 설계되지 않았거나 통합되지 않았습니다. 팀장에게 문의하세요.</p>
    </main>
  );
}
