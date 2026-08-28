import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Chip,
  DeadlineIndicator,
  Money,
  RecruitmentBadge,
} from '../../shared/ui/primitives';
import { isClientDetail, useProject } from './useProject';

/**
 * SCR-B02 — 프로젝트 상세
 *
 * 원본: features/project-management/prototype/web/ProjectBrowse.tsx 의 `ProjectDetail`.
 *
 * **지원 가능 여부를 여기서 계산하지 않는다.** 서버가 준 `canApply` 를 그대로 따른다 —
 * 화면이 모집 상태로 다시 판정하면 규칙이 두 곳에 생긴다 (규칙 13).
 *
 * 하단 추천 섹션과 북마크 아이콘은 engagement 소유다. 슬롯으로 받고 `App.tsx` 가 끼운다
 * (ProjectBrowsePage 와 같은 이유).
 */

export type ProjectDetailPageProps = {
  renderBookmark?: (projectId: string) => ReactNode;
  /** 화면 하단 추천 섹션. 후보가 없으면 engagement 쪽이 스스로 감춘다 (규칙 24) */
  renderRecommendations?: (projectId: string) => ReactNode;
};

export function ProjectDetailPage({
  renderBookmark,
  renderRecommendations,
}: ProjectDetailPageProps) {
  const { projectId = '' } = useParams();
  const { data, loading, error } = useProject(projectId);

  if (loading) {
    return (
      <main className="page">
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="page">
        <p className="status-line error-line" role="alert">
          {error ?? '프로젝트를 찾을 수 없습니다.'}
        </p>
      </main>
    );
  }

  const mine = isClientDetail(data);

  return (
    <main className="page">
      <article>
        <div className="page__head">
          <h1>{data.title}</h1>
          {renderBookmark?.(data.projectId)}
        </div>

        <RecruitmentBadge status={data.recruitmentStatus} />
        {/* 거래 상태는 등록 의뢰인에게만 내려온다 (규칙 9). 키가 없으면 이 줄 자체가 없다. */}
        {mine && <Badge tone="info" label={`거래 상태: ${data.transactionStatus}`} />}

        <p>{data.description}</p>

        <dl>
          <dt>예산</dt>
          <dd>
            <Money amount={data.budgetAmount} />
          </dd>
          <dt>모집 마감</dt>
          <dd>
            <DeadlineIndicator deadlineAt={data.recruitmentDeadlineAt} />
          </dd>
          <dt>필요한 기술</dt>
          <dd>
            {data.skills.map((skill) => (
              <Chip key={skill.skillId} label={skill.displayName} />
            ))}
          </dd>
          <dt>의뢰인</dt>
          <dd>{data.client.companyName ?? data.client.name}</dd>
        </dl>

        {/* 의뢰인 자신에게는 지원 버튼을 두지 않는다 — 누를 수 없는 버튼은 소음이다.
            프리랜서에게는 서버가 준 canApply 로 활성 여부를 정하고, 막혔으면 이유를 문구로 쓴다
            (§12 — 회색 버튼만 두면 왜 못 누르는지 알 수 없다). */}
        {!mine && (
          <Button variant="primary" disabled={data.canApply === false}>
            {data.canApply === false ? '모집이 마감되었습니다' : '지원하기'}
          </Button>
        )}
      </article>

      {renderRecommendations?.(data.projectId)}
    </main>
  );
}
