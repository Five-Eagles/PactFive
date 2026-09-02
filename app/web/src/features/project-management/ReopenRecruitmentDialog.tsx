import { useEffect, useState } from 'react';
import { Button, Field, Notice } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { toIsoOrEmpty } from '../../shared/date';
import { reopenRecruitment } from './api/project';

/**
 * SCR-B10 — 재모집 확인
 *
 * 구조·문구 정본: `features/project-management/design/high-fi-manage.html`.
 * 원본 `prototype/web/ProjectManage.tsx`의 `ReopenRecruitmentDialog`는 `role="dialog"
 * aria-modal="true"`로 만들어져 있어 — 시안은 다른 화면들과 같은 전체 화면 목업으로 그려
 * 두었지만(시안 문서 특성상 모든 상태를 개별 스크린으로 나열한다), 실제 조작 흐름은 SCR-B07
 * 목록에서 "다시 모집하기"를 누르면 뜨는 오버레이가 맞다고 판단했다 — 원본 컴포넌트의 명시적
 * dialog 마크업을 근거로 삼았다. 이 판단은 잠정이며 `feedback_loop/2026-08-29/
 * project-management.md`에 남겨 담당자 확인을 받는다.
 *
 * 오버레이 모션은 `design-tokens.md` §13 규칙(240ms, entrance easing)을 처음 실제로 쓴다 —
 * `shared/ui/tokens.css`의 `.overlay-backdrop`·`.dialog`.
 *
 * `open` 클래스는 마운트 다음 프레임에 붙인다(useEffect + rAF) — 마운트와 동시에 클래스를
 * 넣으면 브라우저가 opacity:0→1 전환을 감지하지 못해 §13 페이드인이 재생되지 않는다
 * (2026-09-01 발견: design-system 모션 규칙 데모 화면에서 같은 실수를 먼저 하고 여기서도 고쳤다).
 */
export type ReopenRecruitmentDialogProps = {
  projectId: string;
  projectTitle: string;
  previousDeadlineAt: string;
  onDismiss: () => void;
  onReopened: (message: string) => void;
};

export function ReopenRecruitmentDialog({
  projectId,
  projectTitle,
  previousDeadlineAt,
  onDismiss,
  onReopened,
}: ReopenRecruitmentDialogProps) {
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function handleReopen() {
    setSubmitting(true);
    setError(null);
    try {
      // recruitmentStartAt 은 보내지 않는다 — 서버가 현재 시각으로 갱신한다 (규칙 33).
      const result = await reopenRecruitment(projectId, {
        recruitmentDeadlineAt: toIsoOrEmpty(deadline),
      });
      onReopened(
        result.reopened
          ? '다시 모집을 시작했습니다.'
          : '이미 모집 중이라 바뀐 것이 없습니다.',
      );
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : '다시 모집하지 못했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`overlay-backdrop${visible ? ' open' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="dialog" role="dialog" aria-labelledby="reopen-title" aria-modal="true">
        <h2 id="reopen-title" className="h3" style={{ marginTop: 0 }}>
          다시 모집하기
        </h2>

        {/* 왜 이 화면이 떴는지 먼저 설명한다. 사실을 말하되 과장하지 않는다 (§12 금지 패턴). */}
        <Notice tone="info">
          협상이 마무리되는 사이에 모집 마감일이 지났습니다. 마감일을 새로 정하면 다시 모집할 수
          있습니다.
        </Notice>

        <div className="card" style={{ margin: '16px 0' }}>
          <p className="body-strong" style={{ margin: '0 0 4px' }}>
            {projectTitle}
          </p>
          <p className="caption" style={{ margin: 0 }}>
            이전 마감일 {previousDeadlineAt.slice(0, 10).replace(/-/g, '.')}
          </p>
        </div>

        {error && <Notice tone="danger">{error}</Notice>}

        <Field
          id="reopen-deadline"
          label="모집 마감일"
          required
          helperText="모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다."
        >
          <input
            id="reopen-deadline"
            className="field"
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            required
          />
        </Field>

        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="quiet" onClick={onDismiss} disabled={submitting}>
            그만두기
          </Button>
          <Button variant="primary" onClick={handleReopen} loading={submitting} disabled={!deadline}>
            다시 모집하기
          </Button>
        </div>
      </div>
    </div>
  );
}
