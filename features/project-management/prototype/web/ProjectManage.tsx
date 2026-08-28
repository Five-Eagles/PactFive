/**
 * SCR-B07 · B06 · B10 — 내 프로젝트 · 수정 · 재모집
 *
 * 문구는 `design/high-fi-manage.html` 의 "필수 요소 목록" 14개를 그대로 쓴다.
 *
 * **잠금을 여기서 계산하지 않는다.** 서버가 준 `editableFields` · `availableActions`
 * 를 그대로 따른다 (규칙 13). 화면이 다시 계산하면 규칙이 두 곳에 생긴다.
 */

import { useState } from "react";
import {
  Button,
  DeadlineIndicator,
  EmptyState,
  Field,
  Money,
  PermissionAwareActions,
  RecruitmentBadge,
  type ActionSpec,
  type RecruitmentStatus,
} from "./ui";

export type ManageItem = {
  projectId: string;
  title: string;
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  pendingApplicationCount: number;
  editableFields: string[];
  availableActions: string[];
};

/** 서버 행동 코드 → 화면 문구. 코드가 그대로 노출되면 안 된다 */
const ACTION_LABELS: Record<string, string> = {
  EDIT: "수정",
  CLOSE_RECRUITMENT: "모집 마감",
  CANCEL: "프로젝트 취소",
  DELETE: "삭제",
  REOPEN_RECRUITMENT: "다시 모집하기",
};

/** 왜 막혔는지. 버튼만 사라지면 사용자는 이유를 알 수 없다 */
function blockedReason(action: string, item: ManageItem): string | undefined {
  if (action === "DELETE" && item.pendingApplicationCount > 0) {
    return `지원자 ${item.pendingApplicationCount}명이 있어 삭제할 수 없습니다`;
  }
  if (action === "EDIT" && item.recruitmentStatus === "CLOSED") {
    return "모집이 마감되어 수정할 수 없습니다";
  }
  return undefined;
}

/* ═══════════ SCR-B07 — 내 프로젝트 ═══════════ */

export function MyProjectList({ items = [] }: { items?: ManageItem[] }) {
  return (
    <div className="manage">
      <div className="manage__head">
        <h1>내 프로젝트</h1>
        <Button variant="primary">프로젝트 등록</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState message="등록한 프로젝트가 없습니다" />
      ) : (
        <ul className="manage__list">
          {items.map((item) => (
            <li key={item.projectId} className="card">
              <h3>{item.title}</h3>
              <RecruitmentBadge status={item.recruitmentStatus} />
              <Money amount={item.budgetAmount} />
              <DeadlineIndicator
                deadlineAt={item.recruitmentDeadlineAt}
                now="2026-08-26T09:00:00Z"
              />
              <PermissionAwareActions actions={toActionSpecs(item)} />
              {/* 다른 화면으로 넘어가는 이동이라 서버 허용 목록에 없다.
                  내 프로젝트면 언제나 열 수 있다 — 지원자 목록은 applications 담당이다. */}
              <a className="card__link" href={`/projects/${item.projectId}/applications`}>
                지원자 관리
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toActionSpecs(item: ManageItem): ActionSpec[] {
  const known = ["EDIT", "CLOSE_RECRUITMENT", "CANCEL", "DELETE", "REOPEN_RECRUITMENT"];
  return known.map((id) => ({
    id,
    label: ACTION_LABELS[id]!,
    available: item.availableActions.includes(id),
    blockedReason: blockedReason(id, item),
    variant: id === "DELETE" || id === "CANCEL" ? "danger" : "secondary",
  }));
}

/* ═══════════ SCR-B06 — 프로젝트 수정 ═══════════ */

export type ProjectEditFormProps = {
  project: ManageItem & { description: string };
  onSave?: (patch: { title: string; description: string }) => void;
  onCancel?: () => void;
};

export function ProjectEditForm({ project, onSave, onCancel }: ProjectEditFormProps) {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);

  // 서버가 준 목록에 없으면 잠긴 칸이다.
  const canEdit = (field: string) => project.editableFields.includes(field);

  return (
    <form
      className="edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.({ title, description });
      }}
    >
      <h1>프로젝트 수정</h1>

      <Field
        id="edit-title"
        label="프로젝트 제목"
        state={canEdit("title") ? "default" : "readOnly"}
      >
        <input
          id="edit-title"
          type="text"
          value={title}
          readOnly={!canEdit("title")}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field
        id="edit-description"
        label="프로젝트 설명"
        state={canEdit("description") ? "default" : "readOnly"}
      >
        <textarea
          id="edit-description"
          rows={6}
          value={description}
          readOnly={!canEdit("description")}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field
        id="edit-budget"
        label="예산"
        state={canEdit("budgetAmount") ? "default" : "readOnly"}
        helperText={
          canEdit("budgetAmount")
            ? undefined
            : `지원자 ${project.pendingApplicationCount}명이 있어 예산은 변경할 수 없습니다.`
        }
      >
        <input
          id="edit-budget"
          type="text"
          defaultValue={String(project.budgetAmount)}
          readOnly={!canEdit("budgetAmount")}
        />
      </Field>

      <Button variant="primary" type="submit">
        저장
      </Button>
      <Button variant="quiet" onClick={onCancel}>
        취소
      </Button>
    </form>
  );
}

/* ═══════════ SCR-B10 — 재모집 ═══════════ */

export type ReopenDialogProps = {
  onReopen?: (deadlineAt: string) => void;
  onDismiss?: () => void;
};

export function ReopenRecruitmentDialog({ onReopen, onDismiss }: ReopenDialogProps) {
  const [deadlineAt, setDeadlineAt] = useState("");

  return (
    <div className="dialog" role="dialog" aria-labelledby="reopen-title" aria-modal="true">
      <h2 id="reopen-title" className="sr-only">
        다시 모집하기
      </h2>

      {/* 왜 이 화면이 떴는지 먼저 설명한다.
          사실을 말하되 과장하지 않는다 (§12 금지 패턴 — 마감 과장). */}
      <p className="dialog__notice">
        협상이 마무리되는 사이에 모집 마감일이 지났습니다. 마감일을 새로 정하면 다시 모집할 수
        있습니다.
      </p>

      <Field id="reopen-deadline" label="모집 마감일" required>
        <input
          id="reopen-deadline"
          type="date"
          value={deadlineAt}
          onChange={(e) => setDeadlineAt(e.target.value)}
        />
      </Field>

      <Button variant="primary" onClick={() => onReopen?.(deadlineAt)}>
        다시 모집하기
      </Button>
      <Button variant="quiet" onClick={onDismiss}>
        그만두기
      </Button>
    </div>
  );
}
