import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import {
  Button,
  Chip,
  DeadlineIndicator,
  Money,
  RecruitmentBadge,
  TransactionBadge,
} from '../../shared/ui/primitives';
import { isClientDetail, useProject } from './useProject';

/**
 * SCR-B02 — 프로젝트 상세
 *
 * 구조 정본: `features/project-management/design/high-fi-browse.html` SCR-B02
 *
 * 시안 구조는 2단이다 — `.detail { grid-template-columns: 1fr 320px }`.
 *   좌: 배지 → 제목(`.h2`) → 캡션 → 설명 카드 → "모집 정보" 카드(`.kv` 행 4개)
 *   우: `.side`(sticky) 의뢰인 카드 + 지원하기/북마크 + 안내 문구
 *
 * 1차 반영에서 이 구조가 통째로 빠져 `<dl>` 한 덩이였다 —
 * feedback_loop/2026-08-28/project-management.md 항목 5.
 *
 * **지원 가능 여부를 여기서 계산하지 않는다.** 서버가 준 `canApply` 를 그대로 따른다 —
 * 화면이 모집 상태로 다시 판정하면 규칙이 두 곳에 생긴다 (규칙 13).
 *
 * 하단 추천 섹션과 북마크 아이콘은 engagement 소유다. 슬롯으로 받고 `App.tsx` 가 끼운다.
 */

export type ProjectDetailPageProps = {
  renderBookmark?: (projectId: string) => ReactNode;
  /** 화면 하단 추천 섹션. 후보가 없으면 engagement 쪽이 스스로 감춘다 (규칙 24) */
  renderRecommendations?: (projectId: string) => ReactNode;
  /** applications 소유 — 지원하기 화면 경로. 없으면(슬롯 미주입) 버튼을 링크로 만들지 않는다. */
  applyHref?: (projectId: string) => string;
};

/** 모집 기간 표기 — 시안의 "즉시 시작 — 2026. 9. 16." */
function recruitmentPeriod(startAt: string | null, deadlineAt: string): string {
  const start = startAt ? formatDate(startAt) : '즉시 시작';
  return `${start} — ${formatDate(deadlineAt)}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

export function ProjectDetailPage({
  renderBookmark,
  renderRecommendations,
  applyHref,
}: ProjectDetailPageProps) {
  const { projectId = '' } = useParams();
  const { data, loading, error } = useProject(projectId);

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
        <p className="status-line error-line" role="alert">
          {error ?? '프로젝트를 찾을 수 없습니다.'}
        </p>
      </PageBody>
    );
  }

  const mine = isClientDetail(data);

  return (
    <PageBody>
      <article className="detail">
        <div>
          <RecruitmentBadge status={data.recruitmentStatus} />
          {/* 거래 상태는 등록 의뢰인에게만 내려온다 (규칙 9). 키가 없으면 이 배지 자체가 없다. */}
          {mine && <TransactionBadge status={data.transactionStatus} />}

          <h1 className="h2" style={{ marginTop: 10 }}>
            {data.title}
          </h1>
          <p className="caption" style={{ margin: '0 0 20px' }}>
            {data.category.displayName} ·{' '}
            <DeadlineIndicator deadlineAt={data.recruitmentDeadlineAt} compact />
          </p>

          <div className="card" style={{ marginBottom: 20 }}>
            {/* 줄바꿈을 살린다 — 담당자가 문단으로 적은 설명이 한 덩이로 뭉치면 읽기 나쁘다 */}
            <p style={{ margin: 0, lineHeight: '26px', whiteSpace: 'pre-wrap' }}>
              {data.description}
            </p>
          </div>

          <h2 className="title">모집 정보</h2>
          <div className="card">
            <div className="kv">
              <span className="kv__k">예산</span>
              <span>
                <Money amount={data.budgetAmount} />
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">모집 기간</span>
              <span>{recruitmentPeriod(data.recruitmentStartAt, data.recruitmentDeadlineAt)}</span>
            </div>
            <div className="kv">
              <span className="kv__k">필요한 기술</span>
              <span className="pcard__skills">
                {data.skills.map((skill) => (
                  <Chip key={skill.skillId} label={skill.displayName} />
                ))}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">지원 현황</span>
              <span>지원 {data.applicationCount}건</span>
            </div>
          </div>
        </div>

        <aside className="side">
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="caption" style={{ margin: '0 0 10px' }}>
              의뢰인
            </p>
            <p className="body-strong" style={{ margin: '0 0 2px' }}>
              {data.client.companyName ?? data.client.name}
            </p>
            <p className="caption" style={{ margin: 0 }}>
              평점 {data.client.averageRating} · 리뷰 {data.client.reviewCount}건
            </p>
          </div>

          {/* 의뢰인 자신에게는 지원 버튼을 두지 않는다 — 누를 수 없는 버튼은 소음이다.
              프리랜서에게는 서버가 준 canApply 로 활성 여부를 정하고, 막혔으면 이유를 문구로
              쓴다 (§12 — 회색 버튼만 두면 왜 못 누르는지 알 수 없다). */}
          {!mine && (
            <>
              <div className="btn-row" style={{ marginBottom: 12 }}>
                <span style={{ flex: 1 }}>
                  {data.canApply === false || !applyHref ? (
                    <Button variant="primary" fullWidth disabled>
                      {data.canApply === false ? '모집이 마감되었습니다' : '지원하기'}
                    </Button>
                  ) : (
                    <Link to={applyHref(data.projectId)} className="btn btn--primary btn--full">
                      지원하기
                    </Link>
                  )}
                </span>
                {renderBookmark?.(data.projectId)}
              </div>
              <p className="caption" style={{ textAlign: 'center', margin: 0 }}>
                지원서는 의뢰인에게 바로 전달됩니다
              </p>
            </>
          )}
        </aside>
      </article>

      {renderRecommendations?.(data.projectId)}
    </PageBody>
  );
}
