import { PageBody } from './ui/AppShell';
import { EmptyState } from './ui/primitives';

/**
 * 아직 설계/통합되지 않은 기능의 라우트에 들어왔을 때 보여주는 공용 안내 화면.
 *
 * `NotFoundPage`(App.tsx, 진짜 404 — 경로 자체가 없음)와는 다르다. 이 컴포넌트는 "경로는
 * 등록돼 있지만 화면 구현이 아직 없다"는 뜻이다 — applications·ai-pricing·reviews·
 * notifications, 그리고 contracts-payments의 웹 화면(서버만 반영됨)이 여기 해당한다.
 *
 * 2026-08-28: 인라인 스타일을 `shared/ui`의 `EmptyState`로 바꿨다. 안내 문구 하나를 위해
 * 자체 레이아웃을 들고 있을 이유가 없고, "결과가 없을 때 다음 행동을 알려준다"는 점에서
 * EmptyState와 성격이 같다 (feedback_loop/2026-08-28/user-management.md 항목 4).
 */
type NotIntegratedPageProps = {
  /** 실제 기능 한글명 또는 폴더명. 문구에 그대로 노출된다. */
  featureName: string;
};

export function NotIntegratedPage({ featureName }: NotIntegratedPageProps) {
  return (
    <PageBody>
      <EmptyState
        title={featureName}
        body={`${featureName}은 설계되지 않았거나 통합되지 않았습니다. 팀장에게 문의하세요.`}
      />
    </PageBody>
  );
}
