import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Notice } from '../../shared/ui/primitives';
import { useCreateReview, useProjectReviews } from './useReviews';
import {
  CLIENT_TO_FREELANCER_TAGS,
  FREELANCER_TO_CLIENT_TAGS,
  type CreateReviewInput,
} from './review.types';

/**
 * 리뷰(규칙 11) — `features/reviews/prototype/web/ReviewPanel.tsx`의 view 스위칭(정적 목업)을
 * 실제 제출·목록 조회로 재해석했다.
 *
 * 시안은 `incomplete`/`canceled`/`duplicate`를 서버 판정 없이 view prop으로만 재현했다.
 * 여기서는 그 문구를 서버가 돌려주는 오류 코드(`TRANSACTION_NOT_COMPLETED`·
 * `PROJECT_TRANSITION_CONFLICT`·`REVIEW_ALREADY_EXISTS`)에 매핑해 같은 화면을 보여준다 —
 * 어느 방향(의뢰인→프리랜서/프리랜서→의뢰인)인지는 서버가 세션으로 판정하므로 태그
 * 선택지는 두 방향 모두 보여주고 서버가 422로 걸러낸다(간단한 절충 — 태그 집합을
 * 미리 좁히려면 이 화면이 상대가 누구인지 알아야 하는데, 지금 프로젝트 상세 API는
 * 프리랜서에게 거래 상태를 내려주지 않는다. feedback_loop/2026-09-05/reviews.md에
 * 후속 과제로 남긴다).
 */

const ALL_TAGS = [...CLIENT_TO_FREELANCER_TAGS, ...FREELANCER_TO_CLIENT_TAGS];

const TAG_LABEL: Record<string, string> = {
  RESPONSIBILITY: '책임감',
  COMMUNICATION: '커뮤니케이션',
  TECHNICAL_SKILL: '기술력',
  SCHEDULE_COMPLIANCE: '일정 준수',
  DELIVERABLE_QUALITY: '결과물 품질',
  REQUIREMENT_CLARITY: '요구사항 명확성',
  FEEDBACK_SPEED: '피드백 속도',
  SCOPE_STABILITY: '범위 안정성',
  PAYMENT_RELIABILITY: '대금 지급 신뢰도',
};

function toInput(rating: string, comment: string, tags: string[]): CreateReviewInput | null {
  const ratingNumber = Number(rating);
  if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) return null;
  return { rating: ratingNumber, comment: comment.trim() || undefined, tags };
}

export function ReviewPage() {
  const { projectId = '' } = useParams();
  const { data: reviews, loading, error, reload } = useProjectReviews(projectId);
  const { status, errorMessage, errorCode, submit } = useCreateReview(projectId);
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  function handleSubmit() {
    const input = toInput(rating, comment, tags);
    if (!input) {
      setValidationError('별점은 1부터 5까지 정수로 입력해 주세요.');
      return;
    }
    setValidationError(null);
    void submit(input).then((result) => {
      if (result) reload();
    });
  }

  if (loading) {
    return (
      <PageBody>
        <article className="panel" aria-busy="true">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
          </div>
          <p className="helper">리뷰 화면을 불러오는 중입니다.</p>
          <div className="skeleton" />
          <div className="skeleton" />
        </article>
      </PageBody>
    );
  }

  if (error || !reviews) {
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
          </div>
          <Notice tone="danger">{error ?? '리뷰를 불러오지 못했습니다.'}</Notice>
          <div className="btn-row">
            <Button variant="primary" onClick={reload}>
              다시 시도
            </Button>
          </div>
        </article>
      </PageBody>
    );
  }

  if (status === 'submitted') {
    // 제출 뒤에는 수정 버튼을 두지 않는다. "수정" 문구도 넣지 않는다 (규칙 11).
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
            <span className="badge success">제출됨</span>
          </div>
          <p className="status-copy">제출한 리뷰는 다시 작성할 수 없습니다.</p>
          <p className="helper">상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.</p>
          <dl className="facts">
            <dt>별점</dt>
            <dd>{rating}</dd>
          </dl>
        </article>
      </PageBody>
    );
  }

  if (errorCode === 'REVIEW_ALREADY_EXISTS' || errorCode === 'TRANSACTION_NOT_COMPLETED' || errorCode === 'PROJECT_TRANSITION_CONFLICT') {
    const presentation =
      errorCode === 'REVIEW_ALREADY_EXISTS'
        ? { badge: '작성 완료', tone: 'info' as const, title: '이미 작성한 리뷰입니다', body: '이 거래의 리뷰는 한 번만 작성할 수 있습니다. 제출한 내용은 바꿀 수 없습니다.' }
        : errorCode === 'TRANSACTION_NOT_COMPLETED'
          ? { badge: '거래 미완료', tone: 'warning' as const, title: '거래가 완료되지 않았습니다', body: '거래가 완료되면 리뷰를 작성할 수 있습니다. 지금은 완료를 기다려 주세요.' }
          : { badge: '취소됨', tone: 'danger' as const, title: '취소된 거래는 리뷰할 수 없습니다', body: '이 프로젝트는 취소되었습니다. 리뷰를 남길 수 있는 거래가 아닙니다.' };
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
            <span className="badge">{presentation.badge}</span>
          </div>
          <Notice tone={presentation.tone}>{presentation.title}</Notice>
          <p className="status-copy">{presentation.body}</p>
        </article>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
          <span className="badge info">
            {reviews.length === 0 ? '작성 전' : reviews.length === 1 ? '상대 대기' : '작성 완료'}
          </span>
        </div>

        {reviews.length > 0 && (
          <>
            <p className="status-copy">이미 등록된 리뷰</p>
            {reviews.map((item) => (
              <dl className="facts" key={item.reviewId}>
                <dt>별점</dt>
                <dd>{item.rating}</dd>
                {item.comment && (
                  <>
                    <dt>코멘트</dt>
                    <dd>{item.comment}</dd>
                  </>
                )}
              </dl>
            ))}
          </>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <p className="status-copy">
            거래가 완료되었습니다. <strong>상대가 작성하기 전</strong>에는 상대 리뷰가 보이지 않습니다.
            별점을 입력한 뒤 리뷰 작성을 누르세요.
          </p>

          {status === 'error' && errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
          {validationError && <Notice tone="danger">{validationError}</Notice>}

          <div className="field-row">
            <label className="label" htmlFor="rating">
              별점
            </label>
            <input
              className="field"
              id="rating"
              name="rating"
              placeholder="1~5"
              inputMode="numeric"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
            />
            <p className="helper">1부터 5까지. 제출하면 바꿀 수 없습니다.</p>
          </div>

          <div className="field-row">
            <label className="label" htmlFor="comment">
              코멘트
            </label>
            <textarea
              className="field"
              id="comment"
              name="comment"
              placeholder="코멘트 (선택)"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>

          <div className="field-row">
            <span className="label">태그 (선택)</span>
            <div className="btn-row">
              {ALL_TAGS.map((tag) => (
                <Button
                  key={tag}
                  type="button"
                  variant={tags.includes(tag) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => toggleTag(tag)}
                >
                  {TAG_LABEL[tag] ?? tag}
                </Button>
              ))}
            </div>
          </div>

          <p className="helper">상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.</p>

          <div className="btn-row">
            <Button type="submit" variant="primary" loading={status === 'submitting'}>
              리뷰 작성
            </Button>
          </div>
        </form>
      </article>
    </PageBody>
  );
}
