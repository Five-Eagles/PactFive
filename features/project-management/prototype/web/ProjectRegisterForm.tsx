/**
 * SCR-B03 · B04 · B05 — 프로젝트 등록 3단계
 *
 * 문구는 `design/high-fi-register.html` 의 "필수 요소 목록" 20개를 그대로 쓴다.
 * 그 목록은 PRD §14.5 정본을 옮긴 것이라, 여기서 한 글자라도 바꾸면 정본과 갈라진다.
 *
 * **세 단계를 한 컴포넌트에 둔다.** 규칙 1 이 "서버에는 마지막 단계에서 한 번만
 * 저장한다"이므로 단계 사이 상태가 한 곳에 있어야 한다. 파일을 나누면 중간 상태를
 * 어딘가에 올려두게 되고, 그게 서버 임시 저장으로 번진다.
 */

import { useState } from "react";
import { Button, Field } from "./ui";
import { useDraft, type DraftStore } from "./useDraft";

export type RegisterDraft = {
  title: string;
  description: string;
  category: string;
  recruitmentStartAt: string;
  recruitmentDeadlineAt: string;
  budgetAmount: string;
  skillIds: string[];
};

const EMPTY_DRAFT: RegisterDraft = {
  title: "",
  description: "",
  category: "",
  recruitmentStartAt: "",
  recruitmentDeadlineAt: "",
  budgetAmount: "",
  skillIds: [],
};

const CATEGORIES = [
  { value: "WEB_DEVELOPMENT", label: "웹 개발" },
  { value: "MOBILE_APP", label: "모바일 앱" },
  { value: "DESIGN", label: "디자인" },
  { value: "DATA_AI", label: "데이터·AI" },
  { value: "PLANNING", label: "기획" },
  { value: "MARKETING", label: "마케팅" },
];

const SKILLS = [
  { value: "REACT", label: "React" },
  { value: "NODEJS", label: "Node.js" },
  { value: "SQL", label: "SQL" },
  { value: "TYPESCRIPT", label: "TypeScript" },
  { value: "FIGMA", label: "Figma" },
  { value: "PYTHON", label: "Python" },
];

export type ProjectRegisterFormProps = {
  onSubmit?: (draft: RegisterDraft) => void;
  /** 기본은 1단계. 테스트에서 특정 단계를 바로 열 때 쓴다 */
  initialStep?: 1 | 2 | 3;
  /** 브라우저 없이 초안 보존을 확인할 때 넣는다 */
  draftStore?: DraftStore;
};

/** 필드 구성이 바뀌면 올린다. 옛 초안은 되살리지 않는다 */
const DRAFT_VERSION = 1;

export function ProjectRegisterForm({
  onSubmit,
  initialStep = 1,
  draftStore,
}: ProjectRegisterFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);

  // 규칙 1 은 **서버** 임시 저장을 금지한다. 브라우저 보존은 그 대상이 아니다.
  // 새로고침·뒤로 가기로 20자 넘는 설명을 다시 쓰게 하지 않는다 (CR-0006 결함 3).
  const {
    value: draft,
    setValue: setDraft,
    restored,
    restoredAt,
    discard,
    clear,
  } = useDraft<RegisterDraft>({
    name: "project-register",
    version: DRAFT_VERSION,
    initial: EMPTY_DRAFT,
    ...(draftStore ? { store: draftStore } : {}),
  });

  function set<K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toggleSkill(id: string) {
    setDraft((d) => ({
      ...d,
      skillIds: d.skillIds.includes(id)
        ? d.skillIds.filter((s) => s !== id)
        : [...d.skillIds, id],
    }));
  }

  return (
    <form
      className="register"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(draft);
        // 등록에 성공했으면 초안은 역할이 끝났다.
        clear();
      }}
    >
      {/* 몰래 되살리지 않는다 — 무엇이 복원됐는지 알리고 버릴 길을 준다.
          §6 상태 이해 · 선택권 */}
      {restored && (
        <div className="draft-restored" role="status">
          <span>
            작성 중이던 내용을 불러왔습니다
            {restoredAt && <span className="draft-restored__at"> · {restoredAt.slice(0, 16).replace("T", " ")}</span>}
          </span>
          <Button variant="quiet" onClick={discard}>
            처음부터 작성
          </Button>
        </div>
      )}
      {/* 세 단계를 모두 렌더링하고 현재 단계만 보인다.
          입력값이 단계를 오갈 때 사라지지 않게 한다 (§11 "입력 보존"). */}

      {/* ═══ SCR-B03 ═══ */}
      <section hidden={step !== 1} aria-labelledby="step1-heading">
        <h2 id="step1-heading" className="sr-step">
          기본 정보
        </h2>

        <Field
          id="title"
          label="프로젝트 제목"
          required
          helperText="5자 이상 100자 이하로 입력해 주세요."
        >
          <input
            id="title"
            type="text"
            value={draft.title}
            placeholder="예) 쇼핑몰 웹사이트 구축"
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>

        <Field
          id="description"
          label="프로젝트 설명"
          required
          helperText="20자 이상 적어 주시면 AI 단가 분석을 더 정확하게 받을 수 있습니다."
        >
          <textarea
            id="description"
            rows={6}
            value={draft.description}
            placeholder="어떤 작업이 필요한지 구체적으로 적어 주세요."
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field id="category" label="카테고리" required>
          <select
            id="category"
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">선택해 주세요</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Button variant="primary" onClick={() => setStep(2)}>
          다음
        </Button>
      </section>

      {/* ═══ SCR-B04 ═══ */}
      <section hidden={step !== 2} aria-labelledby="step2-heading">
        <h2 id="step2-heading" className="sr-step">
          일정과 예산
        </h2>

        <Field id="startAt" label="모집 시작일 (선택)">
          <input
            id="startAt"
            type="text"
            value={draft.recruitmentStartAt}
            placeholder="비워두면 바로 모집을 시작합니다"
            onChange={(e) => set("recruitmentStartAt", e.target.value)}
          />
        </Field>

        <Field
          id="deadlineAt"
          label="모집 마감일"
          required
          helperText="모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다."
        >
          <input
            id="deadlineAt"
            type="date"
            value={draft.recruitmentDeadlineAt}
            onChange={(e) => set("recruitmentDeadlineAt", e.target.value)}
          />
        </Field>

        <Field
          id="budget"
          label="예산"
          required
          helperText="단위는 원입니다. 나중에 지원자가 생기면 변경할 수 없습니다."
        >
          <input
            id="budget"
            type="text"
            inputMode="numeric"
            value={draft.budgetAmount}
            placeholder="예) 5,000,000"
            onChange={(e) => set("budgetAmount", e.target.value)}
          />
        </Field>

        <Button variant="primary" onClick={() => setStep(3)}>
          다음
        </Button>
      </section>

      {/* ═══ SCR-B05 ═══ */}
      <section hidden={step !== 3} aria-labelledby="step3-heading">
        <h2 id="step3-heading" className="sr-step">
          기술과 확인
        </h2>

        <Field
          id="skills"
          label="필요한 기술"
          required
          helperText="최소 1개, 최대 10개까지 선택할 수 있습니다."
        >
          <div id="skills" className="skills">
            {SKILLS.map((s) => (
              <label key={s.value} className="skills__item">
                <input
                  type="checkbox"
                  checked={draft.skillIds.includes(s.value)}
                  onChange={() => toggleSkill(s.value)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </Field>

        {/* 도메인 패턴 ProjectBriefSummary — 등록 전 마지막 확인 */}
        <h3>입력한 내용을 확인해 주세요</h3>
        <dl className="brief">
          <dt>프로젝트 제목</dt>
          <dd>
            {draft.title || "—"}{" "}
            <a href="#title" onClick={() => setStep(1)}>
              수정
            </a>
          </dd>
          <dt>예산</dt>
          <dd>{draft.budgetAmount || "—"}</dd>
        </dl>

        <Button variant="primary" type="submit">
          등록하기
        </Button>
      </section>
    </form>
  );
}
