import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Notice } from '../../shared/ui/primitives';
import { useCreateReview, useMyProjectReview, useProjectReviews } from './useReviews';
import {
  CLIENT_TO_FREELANCER_TAGS,
  FREELANCER_TO_CLIENT_TAGS,
  type CreateReviewInput,
  type ReviewDirection,
} from './review.types';

/**
 * 리뷰(규칙 11) — R-07: `/reviews/me`의 myDirection으로 태그를 가르고, 제출 전 확인 모달을 둔다.
 */

const CLIENT_TAG_LABEL: Record<string, string> = {
  WORK_QUALITY: '결과물 품질이 좋아요',
  ON_TIME_DELIVERY: '납기를 잘 지켜요',
  GOOD_COMMUNICATION: '소통이 원활해요',
  REQUIREMENT_UNDERSTANDING: '요구사항 이해가 정확해요',
  PROFESSIONAL_ATTITUDE: '업무 태도가 전문적이에요',
};

const FREELANCER_TAG_LABEL: Record<string, string> = {
  CLEAR_REQUIREMENTS: '요구사항이 명확해요',
  FAST_FEEDBACK: '피드백이 빨라요',
  GOOD_COMMUNICATION: '소통이 원활해요',
  SCOPE_STABILITY: '업무 범위가 안정적이에요',
  PROFESSIONAL_ATTITUDE: '협업 태도가 전문적이에요',
};

function tagsForDirection(direction: ReviewDirection | null) {
  if (direction === 'CLIENT_TO_FREELANCER') {
    return CLIENT_TO_FREELANCER_TAGS.map((code) => ({ code, label: CLIENT_TAG_LABEL[code] ?? code }));
  }
  if (direction === 'FREELANCER_TO_CLIENT') {
    return FREELANCER_TO_CLIENT_TAGS.map((code) => ({ code, label: FREELANCER_TAG_LABEL[code] ?? code }));
  }
  return [];
}

function toInput(rating: string, content: string, tags: string[]): CreateReviewInput | null {
  const ratingNumber = Number(rating);
  if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) return null;
  return { rating: ratingNumber, content: content.trim() || undefined, tags };
}

export function ReviewPage() {
  const { projectId = '' } = useParams();
  const { data: reviews, loading, error, reload } = useProjectReviews(projectId);
  const { data: me, loading: meLoading, error: meError, reload: reloadMe } = useMyProjectReview(projectId);
  const { status, errorMessage, errorCode, submit } = useCreateReview(projectId);
  const [rating, setRating] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tagOptions = tagsForDirection(me?.myDirection ?? null);

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  }

  function openConfirm() {
    const input = toInput(rating, content, tags);
    if (!input) {
      setValidationError('별점은 1부터 5까지 정수로 입력해 주세요.');
      return;
    }
    setValidationError(null);
    setConfirmOpen(true);
  }

  function confirmSubmit() {
    const input = toInput(rating, content, tags);
    if (!input) return;
    setConfirmOpen(false);
    void submit(input).then((result) => {
      if (result) {
        reload();
        reloadMe();
      }
    });
  }

  if (loading || meLoading) {
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

  if (error || meError || !reviews || !me) {
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
          </div>
          <Notice tone="danger">{error ?? meError ?? '리뷰를 불러오지 못했습니다.'}</Notice>
          <div className="btn-row">
            <Button
              variant="primary"
              onClick={() => {
                reload();
                reloadMe();
              }}
            >
              다시 시도
            </Button>
          </div>
        </article>
      </PageBody>
    );
  }

  if (status === 'submitted' || me.reason === 'REVIEW_ALREADY_SUBMITTED') {
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">리뷰</h2>
            <span className="badge success">제출됨</span>
          </div>
          <p className="status-copy">제출한 리뷰는 다시 작성할 수 없습니다.</p>
          <p className="helper">상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.</p>
          {rating && (
            <dl className="facts">
              <dt>별점</dt>
              <dd>{rating}</dd>
            </dl>
          )}
        </article>
      </PageBody>
    );
  }

  if (
    !me.canReview ||
    errorCode === 'REVIEW_ALREADY_SUBMITTED' ||
    errorCode === 'PROJECT_NOT_COMPLETED' ||
    me.reason === 'PROJECT_NOT_COMPLETED' ||
    me.reason === 'REVIEW_FORBIDDEN' ||
    me.reason === 'REVIEW_PERIOD_CLOSED'
  ) {
    const presentation =
      me.reason === 'REVIEW_PERIOD_CLOSED'
        ? {
            badge: '기한 마감',
            tone: 'warning' as const,
            title: '리뷰 작성 기간이 끝났습니다',
            body: '완료일로부터 14일이 지나 새 리뷰를 작성할 수 없습니다.',
          }
        : me.reason === 'REVIEW_FORBIDDEN' || errorCode === 'REVIEW_ALREADY_SUBMITTED'
          ? {
              badge: '작성 불가',
              tone: 'info' as const,
              title: '리뷰를 작성할 수 없습니다',
              body: '이 거래의 당사자만 리뷰를 남길 수 있습니다.',
            }
          : {
              badge: '거래 미완료',
              tone: 'warning' as const,
              title: '거래가 완료되지 않았습니다',
              body: '거래가 완료되면 리뷰를 작성할 수 있습니다 — 취소된 거래는 리뷰를 남길 수 없습니다.',
            };
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
                {item.content && (
                  <>
                    <dt>코멘트</dt>
                    <dd>{item.content}</dd>
                  </>
                )}
              </dl>
            ))}
          </>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            openConfirm();
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
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>

          <div className="field-row">
            <span className="label">태그 (선택)</span>
            <div className="btn-row">
              {tagOptions.map((tag) => (
                <Button
                  key={tag.code}
                  type="button"
                  variant={tags.includes(tag.code) ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => toggleTag(tag.code)}
                >
                  {tag.label}
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

      {confirmOpen && (
        <ReviewConfirmDialog
          rating={rating}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmSubmit}
        />
      )}
    </PageBody>
  );
}

function ReviewConfirmDialog({
  rating,
  onCancel,
  onConfirm,
}: {
  rating: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="overlay-backdrop open" role="presentation">
      <div className="overlay-card" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title">
        <h3 id="review-confirm-title" className="title">
          리뷰를 제출할까요?
        </h3>
        <p className="status-copy">제출 후에는 수정할 수 없습니다. 별점과 내용을 확인해 주세요.</p>
        <dl className="facts">
          <dt>별점</dt>
          <dd>{rating}</dd>
        </dl>
        <div className="btn-row">
          <Button type="button" variant="secondary" onClick={onCancel}>
            돌아가기
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            제출하기
          </Button>
        </div>
      </div>
    </div>
  );
}
