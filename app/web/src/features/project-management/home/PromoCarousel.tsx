import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NotYetTrigger } from '../../../shared/ui/NotYetDialog';
import { PREVIEW_ROUTES } from '../preview/preview.paths';
import type { NotYetScreenKey } from '../../../shared/notYetScreens';
import { PROJECT_ROUTES } from '../project.routes';

/**
 * main.html `.promo` — 기획전 배너 3장. 자동으로 넘기지 않는다(원본 주석 그대로 — 읽는
 * 속도를 화면이 정하면 안 되고, 자동 전환은 스크린리더 사용자에게 특히 불친절하다).
 * `prefers-reduced-motion`은 home.css의 미디어쿼리가 전환을 끈다.
 *
 * 이미지 3장은 `reference-proposal/assets/`에서 그대로 복사했다
 * (`app/web/public/images/home/`) — 실제 최종 자산으로 교체할지는 팀 확인 필요
 * (homepage-transplant-plan.md 9번 Decision).
 */
type Slide = {
  pill: string;
  title: ReactNode;
  body: string;
  ctaLabel: string;
  /**
   * 어디로 보내는가. 둘 중 하나만 준다.
   *
   * `to`        — 실제 경로. 미리보기 화면(`ComingSoonOverlay` 뒤)도 여기 해당한다.
   *                주소는 진짜로 바뀌므로 링크가 맞다.
   * `screenKey` — 아직 갈 곳이 없다. 제자리에서 다이얼로그만 연다.
   */
  ctaTo?: string;
  ctaScreenKey?: NotYetScreenKey;
  image: string;
};

/**
 * 슬라이드는 **함수 안에서** 만든다. 모듈 최상단에 두면 이 파일이 로드되는 시점에
 * `PROJECT_ROUTES` 를 읽는데, 그 파일은 이 화면을 다시 불러오는 순환에 놓여 있어
 * 아직 초기화되기 전이다 ("Cannot access before initialization").
 *
 * 그릴 때 읽으면 순환이 이미 풀린 뒤라 안전하다.
 */
function buildSlides(): Slide[] {
  return [
  {
    pill: 'B2B 서비스 구축 기획전',
    title: (
      <>
        복잡한 운영을 바꾸는
        <br />
        검증된 전문가
      </>
    ),
    body: '기획부터 개발까지 한팀처럼',
    ctaLabel: '전문가 확인하기',
    ctaTo: PREVIEW_ROUTES.experts,
    image: '/images/home/banner-b2b.jpg',
  },
  {
    pill: 'AI 단가 분석',
    title: (
      <>
        예산을 혼자
        <br />
        정하지 않아도 됩니다
      </>
    ),
    body: '비슷한 프로젝트를 근거로 범위를 먼저 알려드립니다',
    ctaLabel: '등록하고 확인하기',
    ctaTo: PROJECT_ROUTES.register,
    image: '/images/home/expert-dashboard.jpg',
  },
  {
    pill: '에스크로 결제',
    title: (
      <>
        납품을 승인한 뒤에
        <br />
        정산됩니다
      </>
    ),
    body: '합의한 금액과 일정이 그대로 계약서가 됩니다',
    ctaLabel: '진행 방식 보기',
    ctaScreenKey: 'safety',
    image: '/images/home/expert-branding.jpg',
  },
  ];
}

export function PromoCarousel() {
  const SLIDES = buildSlides();
  const [at, setAt] = useState(0);

  function show(next: number) {
    setAt((next + SLIDES.length) % SLIDES.length);
  }

  return (
    <div className="promo">
      <div className="promo__stack" aria-hidden="true" />

      <div
        className="promo__view"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') show(at + 1);
          if (event.key === 'ArrowLeft') show(at - 1);
        }}
      >
        <div className="promo__track" style={{ transform: `translateX(${-at * 100}%)` }}>
          {SLIDES.map((slide, index) => (
            <div
              key={slide.pill}
              className="banner"
              role="group"
              aria-roledescription="슬라이드"
              aria-label={`${index + 1} / ${SLIDES.length}`}
              aria-hidden={index !== at}
              // 보이지 않는 슬라이드는 탭 순서에서 뺀다 — 안 그러면 화면 밖으로 포커스가 간다
              // (원본 주석 그대로). `inert`는 JSX 타입에 없어(React 18 @types) DOM 프로퍼티로
              // 직접 건다.
              ref={(el) => {
                if (el) el.inert = index !== at;
              }}
            >
              <div className="banner__copy">
                <span className="pill">{slide.pill}</span>
                <h2>{slide.title}</h2>
                <p>{slide.body}</p>
                {slide.ctaTo ? (
                  <Link className="cta" to={slide.ctaTo}>
                    {slide.ctaLabel}
                  </Link>
                ) : (
                  <NotYetTrigger screenKey={slide.ctaScreenKey!} className="cta">
                    {slide.ctaLabel}
                  </NotYetTrigger>
                )}
              </div>
              <div className="banner__visual">
                <img src={slide.image} alt="" width={640} height={360} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="promo__nav">
        <span className="promo__count">
          {at + 1} / {SLIDES.length}
        </span>
        <button type="button" aria-label="이전 기획전" onClick={() => show(at - 1)}>
          ‹
        </button>
        <button type="button" aria-label="다음 기획전" onClick={() => show(at + 1)}>
          ›
        </button>
      </div>
    </div>
  );
}
