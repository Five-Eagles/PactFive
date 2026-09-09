import { Link } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, EmptyState, Notice } from '../../shared/ui/primitives';
import { PROJECT_ROUTES } from '../project-management/project.routes';
import { REVIEW_ROUTES } from '../reviews/review.routes';
import { useMyApplications } from './useApplications';
import type { ApplicationRejectionType, MyApplicationItem } from './application.types';

/**
 * 내 지원 현황(규칙 10, 프리랜서) — `ApplicationPanel.tsx`의 "mine"/"mineDeleted"/"mineCanceled"
 * 뷰를 실제 목록으로 재해석했다.
 *
 * 2026-09-07 PR #83 이식 — 응답에 `projectNotice`(NONE/CANCELED/DELETED)가 새로 생겨서,
 * 예전엔 다루지 않던 삭제·취소 안내(규칙 10 "삭제된 프로젝트 「의뢰인이 삭제한
 * 프로젝트입니다.」")를 이제 실제로 보여줄 수 있다. 삭제된 프로젝트는 상세로 들어가는
 * 링크를 주지 않는다 — 어차피 project-management가 404를 돌려준다.
 *
 * 2026-09-09 팀장 반영(이식 지시서 §3-1·3-2·3-3) — 상태 라벨을 시스템 상태에서 프리랜서
 * 관점 문구로 바꾸고, 서버가 이미 내려주고 있던 `rejectionType`·`transactionStatus`를
 * 처음으로 화면에 반영했다. 「완료됨」 배지 + 리뷰 진입 링크가 지금 프리랜서의 **유일한**
 * 리뷰 진입 경로다.
 */

const STATUS_LABEL: Record<MyApplicationItem['status'], string> = {
  PENDING: '검토 중',
  ACCEPTED: '선정됨',
  REJECTED: '미선정',
};

/** 서버 application.constants.ts의 REJECTION_COPY와 같은 문구(app/web/AGENTS.md "폴더 간
 * 접점" — 서버 폴더를 직접 import하지 않고 화면이 필요한 만큼 옮긴다). */
const REJECTION_COPY: Record<ApplicationRejectionType, string> = {
  DIRECT: '의뢰인이 이번 지원을 선정하지 않았습니다.',
  AUTO_OTHER_ACCEPTED: '다른 지원자가 선정되어 이번 지원은 마감되었습니다.',
  AUTO_RECRUITMENT_CLOSED: '프로젝트 모집이 마감되어 지원이 종료되었습니다.',
  AGREEMENT_DECLINED: '금액 합의가 최종 거절되어 선정이 종료되었습니다.',
};

export function MyApplicationsPage() {
  const { data, loading, error, reload } = useMyApplications();

  if (loading) {
    return (
      <PageBody>
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      </PageBody>
    );
  }

  if (error || !data) {
    return (
      <PageBody>
        <Notice tone="danger">{error ?? '내 지원 현황을 불러오지 못했습니다.'}</Notice>
        <div className="btn-row">
          <Button variant="primary" onClick={reload}>
            다시 시도
          </Button>
        </div>
      </PageBody>
    );
  }

  if (data.length === 0) {
    return (
      <PageBody>
        <EmptyState
          title="아직 지원한 프로젝트가 없습니다"
          body="관심 있는 프로젝트에 지원해 보세요."
          action={
            <Link to={PROJECT_ROUTES.browse}>
              <Button variant="primary">프로젝트 찾기</Button>
            </Link>
          }
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <h1 className="h3" style={{ marginTop: 0 }}>
        내 지원 현황
      </h1>
      <p className="status-copy">
        제출한 지원은 프로젝트 상태와 함께 남습니다. 의뢰인이 삭제해도 이 목록에서 지워지지 않습니다.
      </p>
      <div className="card">
        {data.map((item) => {
          // 규칙 10 — ACCEPTED ∧ transactionStatus=COMPLETED일 때만 「완료됨」이다. 그 전에는
          // 선정됐어도(ACCEPTED) 계약·거래가 끝나지 않았을 수 있다(STATUS_LABEL의 "선정됨").
          const completed = item.status === 'ACCEPTED' && item.transactionStatus === 'COMPLETED';
          return (
            <div className="row" key={item.applicationId}>
              <div className="row__main">
                {item.projectNotice === 'DELETED' ? (
                  <span>프로젝트</span>
                ) : (
                  <Link to={PROJECT_ROUTES.detail(item.projectId)}>{item.projectId}</Link>
                )}
                <span className="row__sub">지원일 {item.createdAt.slice(0, 10).replace(/-/g, '.')}</span>
                {item.projectNotice === 'DELETED' && (
                  <span className="row__sub">의뢰인이 삭제한 프로젝트입니다.</span>
                )}
                {item.projectNotice === 'CANCELED' && <span className="row__sub">프로젝트가 취소되었습니다.</span>}
                {item.status === 'REJECTED' && item.rejectionType && (
                  <span className="row__sub">{REJECTION_COPY[item.rejectionType]}</span>
                )}
                {completed && (
                  <div className="btn-row">
                    <Link to={REVIEW_ROUTES.project(item.projectId)}>
                      <Button variant="primary">리뷰 작성</Button>
                    </Link>
                  </div>
                )}
              </div>
              <span
                className={`badge ${
                  completed
                    ? 'success'
                    : item.status === 'ACCEPTED'
                      ? 'info'
                      : item.status === 'REJECTED'
                        ? 'neutral'
                        : 'warning'
                }`}
              >
                {completed ? '완료됨' : STATUS_LABEL[item.status]}
              </span>
            </div>
          );
        })}
      </div>
    </PageBody>
  );
}
