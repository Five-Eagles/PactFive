/**
 * SCR-B01 · B02 — 프로젝트 탐색과 상세
 *
 * 문구는 `design/high-fi-browse.html` 의 "필수 요소 목록" 9개를 그대로 쓴다.
 *
 * **거래 상태를 다루지 않는다.** 이 화면이 받는 데이터에는 그 키 자체가 없다 (규칙 9).
 * 화면에서 숨기는 것이 아니라 서버가 안 보낸다.
 */

import {
  Badge,
  Button,
  DeadlineIndicator,
  EmptyState,
  Money,
  RecruitmentBadge,
  type RecruitmentStatus,
} from "./ui";

export type BrowseItem = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
  client: { name: string; companyName: string | null };
};

export type ProjectBrowseProps = {
  items?: BrowseItem[];
  now?: string;
  onSearch?: (keyword: string) => void;
};

/**
 * 정렬 선택지. 라벨은 필수 요소 목록의 정본 문구다.
 * `sortBy` 값은 api-contract.md 의 쿼리 파라미터와 같아야 한다.
 */
const SORTS = [
  { value: "latest", label: "최신순" },
  { value: "deadline", label: "마감임박순" },
  { value: "budget", label: "예산 높은순" },
];

export function ProjectBrowse({ items = [], now = "2026-08-26T09:00:00Z" }: ProjectBrowseProps) {
  return (
    <div className="browse">
      <div className="browse__bar">
        <label className="sr-only" htmlFor="browse-search">
          프로젝트 검색
        </label>
        <input id="browse-search" type="search" placeholder="프로젝트를 검색해 보세요" />
        <Button variant="secondary">필터</Button>

        <label className="sr-only" htmlFor="browse-sort">
          정렬
        </label>
        <select id="browse-sort" defaultValue="latest">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <EmptyState message="조건에 맞는 프로젝트가 없습니다" />
      ) : (
        <ul className="browse__list">
          {items.map((p) => (
            <li key={p.projectId} className="card">
              {/* 도메인 패턴 ProjectCard — 비교에 필요한 항목을 늘 같은 순서로 둔다.
                  순서가 카드마다 다르면 눈으로 비교할 수 없다. */}
              <h3 className="card__title">{p.title}</h3>
              <p className="card__client">
                {p.client.companyName ?? p.client.name}
              </p>
              <p className="card__budget">
                <Money amount={p.budgetAmount} />
              </p>
              <p className="card__deadline">
                <DeadlineIndicator deadlineAt={p.recruitmentDeadlineAt} now={now} />
              </p>
              <p className="card__skills">
                {p.skills.map((s) => (
                  <Badge key={s.skillId} tone="neutral" label={s.displayName} />
                ))}
              </p>
              <RecruitmentBadge status={p.recruitmentStatus} />
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

export type ProjectDetailData = BrowseItem & {
  description: string;
  recruitmentStartAt: string | null;
  canApply?: boolean;
};

export function ProjectDetail({
  project,
  now = "2026-08-26T09:00:00Z",
}: {
  project: ProjectDetailData;
  now?: string;
}) {
  return (
    <article className="detail">
      <h1>{project.title}</h1>
      <RecruitmentBadge status={project.recruitmentStatus} />
      <p className="detail__description">{project.description}</p>

      <dl className="detail__facts">
        <dt>예산</dt>
        <dd>
          <Money amount={project.budgetAmount} />
        </dd>
        <dt>모집 마감</dt>
        <dd>
          <DeadlineIndicator deadlineAt={project.recruitmentDeadlineAt} now={now} />
        </dd>
        <dt>필요한 기술</dt>
        <dd>
          {project.skills.map((s) => (
            <Badge key={s.skillId} tone="neutral" label={s.displayName} />
          ))}
        </dd>
      </dl>

      {/* 지원 가능 여부는 서버가 판정한 canApply 를 따른다.
          화면이 모집 상태로 다시 계산하면 두 곳의 규칙이 갈라진다. */}
      <Button variant="primary" disabled={project.canApply === false}>
        지원하기
      </Button>
    </article>
  );
}
