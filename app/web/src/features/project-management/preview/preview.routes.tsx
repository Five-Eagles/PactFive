import { Route } from 'react-router-dom';
import { PREVIEW_ROUTES } from './preview.paths';
import { ComingSoonOverlay } from '../../../shared/ui/ComingSoonOverlay';
import { ExpertsPage } from './ExpertsPage';
import { ExpertDetailPage } from './ExpertDetailPage';

/**
 * 미리보기 화면 — 시안에는 있지만 아직 만들기로 정하지 않은 것들.
 *
 * 전부 `ComingSoonOverlay` 로 감싼다. 주소는 진짜로 바뀌고 화면도 진짜로 그려지지만,
 * 블러 위에 "준비 중입니다" 다이얼로그가 강제로 뜨고 뒤로가기로만 닫힌다
 * (app/web/AGENTS.md "시안에는 있지만 아직 없는 화면" Case 2).
 *
 * **왜 화면을 실제로 만드는가.** 준비 중이라는 말만 띄우고 뒤가 비어 있으면 "아직 안
 * 만들었다" 로 읽힌다. 화면이 살아 있으면 "여기까지 설계해 두었다" 가 된다. 필터도 정렬도
 * 페이지도 실제로 돈다 — 블러 뒤에서.
 *
 * **담당이 정해지면 이 폴더를 떠난다.** 그 기능의 폴더로 옮기고 여기서 라우트를 뺀다.
 * 여기 있다는 것 자체가 "아직 주인이 없다" 는 표시다.
 */
/** 경로 상수는 `preview.paths.ts` 가 정본이다. 부르는 쪽 편의를 위해 여기서도 내보낸다 */
export { PREVIEW_ROUTES };

export function previewRoutes() {
  return (
    <>
      <Route
        path={PREVIEW_ROUTES.experts}
        element={
          <ComingSoonOverlay screenKey="experts">
            <ExpertsPage />
          </ComingSoonOverlay>
        }
      />
      <Route
        path="/experts/:expertId"
        element={
          <ComingSoonOverlay screenKey="experts">
            <ExpertDetailPage />
          </ComingSoonOverlay>
        }
      />
    </>
  );
}
