import { Link } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button } from '../../shared/ui/primitives';
import { PROJECT_ROUTES } from './project.routes';

/**
 * 대표페이지 — 앱 루트(`/`)에 걸리는 첫 화면.
 *
 * **주소는 앱 것이고 화면은 이 폴더 것이다.**
 * `/` 는 앱 껍데기의 로고 링크와 "없는 페이지"의 홈 버튼이 함께 쓰는 자리라
 * `APP_ROUTES.home` 에 남는다. 그 자리에 무엇을 그릴지가 이 기능의 몫이다.
 * 경로는 `project.routes.tsx` 가 App.tsx 에게 받아서 넘긴다.
 *
 * 지금은 `App.tsx` 에 있던 임시 화면을 그대로 옮겨 온 것이다. 확정된 시안은
 * `features/project-management/design/reference-proposal/main.html` 이고,
 * 그것을 옮겨 심는 일은 다음 단계다 — 이 파일은 **위치만 바꾼다.**
 */
export function HomePage() {
  return (
    <PageBody>
      <h1 className="h2">프리랜서와 의뢰인을 잇습니다</h1>
      <p className="helper" style={{ marginBottom: 24 }}>
        프로젝트를 등록하고 지원자를 만나거나, 관심 있는 프로젝트를 찾아 지원해 보세요.
      </p>
      <div className="btn-row">
        <Link to={PROJECT_ROUTES.browse}>
          <Button variant="primary">프로젝트 찾기</Button>
        </Link>
        <Link to={PROJECT_ROUTES.register}>
          <Button variant="secondary">프로젝트 등록</Button>
        </Link>
      </div>
    </PageBody>
  );
}
