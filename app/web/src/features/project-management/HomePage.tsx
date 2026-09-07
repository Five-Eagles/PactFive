import type { ReactNode } from 'react';
import './home/home.css';
import { HomeHeader } from './home/Header';
import { Hero } from './home/Hero';
import { PromoCarousel } from './home/PromoCarousel';
import { ResumeSummary } from './home/ResumeSummary';
import { CategoryGrid } from './home/CategoryGrid';
import { RecruitingProjects } from './home/RecruitingProjects';
import { RecommendedExperts } from './home/RecommendedExperts';
import { Footer } from './home/Footer';
import { useProjectSearch } from './useProject';

/**
 * 대표페이지 — 앱 루트(`/`)에 걸리는 첫 화면.
 *
 * **주소는 앱 것이고 화면은 이 폴더 것이다.** `/`는 앱 껍데기의 로고 링크와 "없는 페이지"의
 * 홈 버튼이 함께 쓰는 자리라 `APP_ROUTES.home`에 남는다. 경로는 `project.routes.tsx`가
 * `App.tsx`에게 받아서 넘긴다.
 *
 * 확정 시안 `features/project-management/design/reference-proposal/main.html`을 옮겨 심었다
 * (PR #57은 위치만 옮긴 임시 화면이었다). 설계 근거·범위·미결정 사항은
 * `features/project-management/design/homepage-transplant-plan.md` 참고.
 *
 * **AppShell을 쓰지 않는다 (Option C).** `App.tsx`가 이 라우트에서는 AppShell로 감싸지 않고
 * 이 화면이 자기 헤더(`home/Header.tsx`)를 그린다 — 시안이 디자인의 루트로 정해졌고,
 * `NotYetTrigger`로 죽은 링크 문제를 풀 수 있게 되면서 시안의 절반(콘텐츠)만 옮길 이유가
 * 없어졌다(homepage-transplant-plan.md 4번 절 2026-09-04 결정).
 *
 * 섹션이 6개·시안 마크업이 약 11,000자라 `home/` 하위 폴더로 쪼갰다 — 이 화면은 데이터
 * 패칭·조립만 하고, 각 섹션 파일은 props로 받은 것만 그린다 (app/web/AGENTS.md "섹션이
 * 여러 개인 화면" 규칙, 이번에 처음 정했다).
 */
export type HomePageProps = {
  viewer: { email: string; role: 'CLIENT' | 'FREELANCER'; userId: string } | null;
  myActivityHref: string;
  onLogout: () => void;
  renderBookmark?: (projectId: string) => ReactNode;
};

export function HomePage({ viewer, myActivityHref, onLogout, renderBookmark }: HomePageProps) {
  // "지금 모집 중인 프로젝트" — 이 화면에서 실제 API로 채워지는 유일한 자리.
  // ProjectBrowsePage와 같은 훅·같은 정렬 규칙을 쓴다(원본 주석 — 하드코딩하면 목록과 달라진다).
  const { data, loading, error } = useProjectSearch({ sortBy: 'latest', page: 1, pageSize: 6 });

  return (
    <div className="home">
      <HomeHeader viewer={viewer} myActivityHref={myActivityHref} onLogout={onLogout} />

      <main>
        <div className="home-wrap">
          <section className="hero">
            <Hero />
            <div>
              <PromoCarousel />
              <ResumeSummary visible={viewer?.role === 'CLIENT'} />
            </div>
          </section>
        </div>

        <CategoryGrid />

        <div className="home-wrap">
          <RecruitingProjects
            items={data?.items ?? []}
            loading={loading}
            error={error}
            renderBookmark={renderBookmark}
          />
          <RecommendedExperts />
        </div>
      </main>

      <Footer />
    </div>
  );
}
