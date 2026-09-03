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
import {
  DestructiveActionSummary,
  cancelEffects,
  closeRecruitmentEffects,
  deleteEffects,
  type DestructiveAction,
} from "./DestructiveActionSummary";
import { MoneyBreakdown, type BudgetSource } from "./MoneyBreakdown";

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

/** 확인 단계를 거쳐야 하는 행동. 되돌릴 수 없는 것만이다 (CR-0006 결함 1) */
// 모집 마감도 넣는다. 재모집으로 프로젝트는 되돌아가도 **지원자에게 간 거절 알림은
// 되돌아가지 않는다** (feedback_loop 2026-09-03 항목 1 · design/high-fi-manage.html 3종)
const DESTRUCTIVE = new Set(["CLOSE_RECRUITMENT", "CANCEL", "DELETE"]);

export type MyProjectListProps = {
  items?: ManageItem[];
  onAction?: (actionId: string, projectId: string) => void;
};

export function MyProjectList({ items = [], onAction }: MyProjectListProps) {
  // 확인을 기다리는 행동. null 이면 다이얼로그가 없다.
  const [pendingAction, setPendingAction] = useState<{
    actionId: string;
    item: ManageItem;
  } | null>(null);

  function request(actionId: string, item: ManageItem) {
    // 되돌릴 수 있는 행동은 바로 실행한다. 전부 확인을 붙이면 확인이 무뎌진다.
    if (!DESTRUCTIVE.has(actionId)) {
      onAction?.(actionId, item.projectId);
      return;
    }
    setPendingAction({ actionId, item });
  }

  return (
    <div className="manage">
      <div className="manage__head">
        <h1>내 프로젝트</h1>
        <Button variant="primary">프로젝트 등록</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="등록한 프로젝트가 없습니다"
          body="첫 프로젝트를 등록하고 프리랜서를 만나보세요."
        />
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
              <PermissionAwareActions actions={toActionSpecs(item, request)} />
              {/* 다른 화면으로 넘어가는 이동이라 서버 허용 목록에 없다.
                  내 프로젝트면 언제나 열 수 있다 — 지원자 목록은 applications 담당이다. */}
              <a className="card__link" href={`/projects/${item.projectId}/applications`}>
                지원자 관리
              </a>
            </li>
          ))}
        </ul>
      )}

      {pendingAction && (
        <DestructiveActionSummary
          action={toDestructiveAction(pendingAction.actionId, pendingAction.item)}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            onAction?.(pendingAction.actionId, pendingAction.item.projectId);
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * 확인 화면에 무엇을 보여줄지 만든다.
 *
 * `hasContract` 는 거래 상태로 판정해야 하는데 `ManageItem` 에 그 값이 없다.
 * **없는 값을 추측하지 않는다** — 대기 지원 수만 가지고 만들고,
 * 계약 관련 문구는 서버가 거래 상태를 내려주면 그때 붙인다.
 */
function toDestructiveAction(actionId: string, item: ManageItem): DestructiveAction {
  if (actionId === "CLOSE_RECRUITMENT") {
    return {
      title: "모집을 마감할까요?",
      subject: item.title,
      effects: closeRecruitmentEffects({ pendingApplicationCount: item.pendingApplicationCount }),
      confirmLabel: "마감하기",
    };
  }
  if (actionId === "DELETE") {
    return {
      title: "삭제",
      subject: item.title,
      effects: deleteEffects(),
      confirmLabel: "삭제합니다",
    };
  }
  return {
    title: "프로젝트 취소",
    subject: item.title,
    effects: cancelEffects({
      pendingApplicationCount: item.pendingApplicationCount,
      hasContract: false,
    }),
    confirmLabel: "취소합니다",
  };
}

function toActionSpecs(
  item: ManageItem,
  request: (actionId: string, item: ManageItem) => void,
): ActionSpec[] {
  const known = ["EDIT", "CLOSE_RECRUITMENT", "CANCEL", "DELETE", "REOPEN_RECRUITMENT"];
  return known.map((id) => ({
    id,
    onClick: () => request(id, item),
    label: ACTION_LABELS[id]!,
    available: item.availableActions.includes(id),
    blockedReason: blockedReason(id, item),
    variant: id === "DELETE" || id === "CANCEL" ? "danger" : "secondary",
  }));
}

/* ═══════════ SCR-B06 — 프로젝트 수정 ═══════════ */

export type ProjectEditFormProps = {
  project: ManageItem & {
    description: string;
    category?: string;
    recruitmentStartAt?: string | null;
    /** 서버가 준다. 없으면 출처를 말하지 않는다 (CR-0006 결함 2) */
    budgetSource?: BudgetSource;
    budgetSourceAt?: string;
  };
  onSave?: (patch: {
    title: string;
    description: string;
    recruitmentStartAt: string;
    recruitmentDeadlineAt: string;
  }) => void;
  onCancel?: () => void;
};

export function ProjectEditForm({ project, onSave, onCancel }: ProjectEditFormProps) {
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description);
  // 규칙 15 를 뒤집으면 **대기 지원이 0건일 때 모집 일정도 수정 가능**이다.
  // editableFields 가 이미 두 필드를 내려보내는데 화면에 칸이 없었다
  // (feedback_loop 2026-08-29 항목 2).
  const [startAt, setStartAt] = useState(project.recruitmentStartAt ?? "");
  const [deadlineAt, setDeadlineAt] = useState(project.recruitmentDeadlineAt.slice(0, 10));

  // 서버가 준 목록에 없으면 잠긴 칸이다.
  const canEdit = (field: string) => project.editableFields.includes(field);

  return (
    <form
      className="edit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.({
          title,
          description,
          recruitmentStartAt: startAt,
          recruitmentDeadlineAt: deadlineAt,
        });
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

      <Field
        id="edit-start"
        label="모집 시작일 (선택)"
        state={canEdit("recruitmentStartAt") ? "default" : "readOnly"}
      >
        <input
          id="edit-start"
          type="date"
          value={startAt.slice(0, 10)}
          readOnly={!canEdit("recruitmentStartAt")}
          onChange={(e) => setStartAt(e.target.value)}
        />
      </Field>

      <Field
        id="edit-deadline"
        label="모집 마감일"
        state={canEdit("recruitmentDeadlineAt") ? "default" : "readOnly"}
        helperText={
          canEdit("recruitmentDeadlineAt")
            ? undefined
            : `지원자 ${project.pendingApplicationCount}명이 있어 모집 일정은 변경할 수 없습니다.`
        }
      >
        <input
          id="edit-deadline"
          type="date"
          value={deadlineAt}
          readOnly={!canEdit("recruitmentDeadlineAt")}
          onChange={(e) => setDeadlineAt(e.target.value)}
        />
      </Field>

      {/* 입력 칸 옆에 출처를 붙인다. 이 숫자가 내가 넣은 값인지
          AI 가 바꾼 값인지 여기서 구분된다 (CR-0006 결함 2) */}
      <MoneyBreakdown
        amount={project.budgetAmount}
        source={project.budgetSource}
        sourceAt={project.budgetSourceAt}
        label="현재 예산"
      />

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
