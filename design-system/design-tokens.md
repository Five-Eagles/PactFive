# PactFive Design System — Tokens & Component Contracts

- 문서 상태: v1.0 Foundation MVP
- 기준일: 2026-08-24
- 제품 컨셉: Trust by Evidence
- 시각 기준: `../../design-concepts/imagegen-kmong-v5/`의 V5 시안 5종
- UX 원칙: `../ux-philosophy/ux-philosophy.md`
- 사람용 프리뷰: `design-system-preview.html`
- 구현 예시: `../ux-philosophy/reference-main.html`(메인/홈 화면),
  `../reference/project-management/*.html`(목록·상세류 포함 개별 파일 7장, 2026-09-03 고정
  스냅샷 — `../reference/README.md` 참고. **AI는 이 개별 파일만 읽는다**, 같은 폴더의
  `project-management-bundle.html`은 base64 이미지가 인라인된 400KB 파일이라 사람이
  브라우저로 확인할 때만 연다)
  — 전부 색상·컴포넌트 값의 정본은 아니며, 이 문서와 다르면 이 문서를 따른다. 2026-09-02: 이전에
  있던 화면 단위·규칙 설명 참고 자료 두 종은 팀 회의에서 반려되어 제거했다 — 경위는
  `docs/decisions/0012-*.md` 참고

## 1. 시스템 목적

PactFive의 디자인 시스템은 화면을 장식하기 위한 스타일 모음이 아니다. 프로젝트 탐색부터 금액 합의, 계약, 결제, 납품까지 같은 업무 사실이 같은 위계와 상태 언어로 이해되게 하는 공통 계약이다.

토큰 사용 순서는 다음과 같다.

1. `primitive`: 원시 값. 디자인 시스템 내부에서만 사용한다.
2. `semantic`: 배경, 내용, 경계, 행동, 피드백처럼 역할을 표현한다.
3. `componentTokens`: 반복되는 UI 구조에 semantic 값을 연결한다.
4. 도메인 타입: 프로젝트, 금액, 상태, 증거를 화면마다 같은 의미로 조합한다.

기능 화면에서는 가능한 한 `primitive`를 직접 참조하지 않고 `semantic` 또는 `componentTokens`를 사용한다.

## 2. 시각 방향

- 시각적 풍부함은 무의미한 색면이 아니라 실제 프로젝트, 작업물, 사람, 평점, 금액, 일정, 파일 미리보기에서 만든다.
- 공개 홈과 탐색 화면은 캠페인·카테고리·작업 사례를 적극적으로 보여준다.
- 예산·계약·작업 화면은 중립적인 업무 UI를 유지하고, 이미지가 근거 또는 산출물일 때만 사용한다.
- 브랜드 색은 주요 행동, 현재 선택, 검증·안전 상태에 집중한다.
- 위험 색은 마감, 실패, 되돌릴 수 없는 결과에만 쓴다.
- 캠페인 색은 실제 캠페인 영역 밖으로 확장하지 않는다.
- 그라데이션, 글래스모피즘, 장식용 추상 도형, 스파클, 범용 AI 마스코트, 거대한 빈 카드, 의미 없는 컬러 분할을 사용하지 않는다.

## 3. 정본 TS 토큰·타입

아래 코드 블록이 구현과 프리뷰가 참조해야 하는 값의 정본이다.

```ts
export const primitive = {
  color: {
    navy: {
      50: "#F5F7FA",
      100: "#E9EDF3",
      200: "#D5DCE7",
      300: "#B7C0CF",
      400: "#8995A8",
      500: "#667085",
      600: "#55627A",
      700: "#394760",
      800: "#1D2942",
      900: "#111B33",
      950: "#0B132B",
    },
    teal: {
      50: "#E7F5F4",
      100: "#C7E9E8",
      200: "#8FD3D1",
      300: "#54BBB9",
      400: "#1D9C9B",
      500: "#008A8D",
      600: "#007C7E",
      700: "#006D70",
      800: "#00585C",
      900: "#073F43",
    },
    rust: {
      50: "#FDEEEA",
      100: "#FAD8CF",
      300: "#EA8A73",
      500: "#D95336",
      600: "#C9472E",
      700: "#B93824",
      800: "#932E20",
    },
    green: {
      50: "#EAF7F0",
      200: "#A7DFC5",
      600: "#16734D",
      700: "#115D3E",
    },
    amber: {
      50: "#FFF9E7",
      100: "#FFF3C4",
      300: "#F2CF6C",
      600: "#9A6200",
      700: "#7A4B00",
    },
    blue: {
      50: "#EDF5FC",
      200: "#B9D9F3",
      600: "#1C5F9C",
      700: "#164E80",
    },
    campaign: {
      yellow: "#F4C430",
      plum: "#4B173C",
      lavender: "#E9DDFB",
    },
    neutral: {
      white: "#FFFFFF",
      canvas: "#FBFAF7",
      surface: "#F7F8FA",
      muted: "#EEF1F5",
      border: "#CBD3DF",
      borderStrong: "#7A8498",
      black: "#090D18",
    },
  },
  font: {
    family: {
      sans: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
    size: { 100: 12, 200: 14, 300: 16, 400: 18, 500: 20, 600: 24, 700: 32, 800: 40, 900: 52 },
    lineHeight: { 100: 16, 200: 20, 300: 24, 400: 28, 500: 32, 600: 40, 700: 48, 800: 60 },
    letterSpacing: { tightest: -1.5, tight: -0.6, normal: 0, wide: 0.2 },
  },
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80 },
  radius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, pill: 999 },
  borderWidth: { none: 0, hairline: 1, strong: 2 },
  shadow: {
    none: "none",
    raised: "0 6px 18px rgba(11, 19, 43, 0.10)",
    overlay: "0 18px 48px rgba(11, 19, 43, 0.18)",
    focus: "0 0 0 3px rgba(0, 138, 141, 0.28)",
  },
  motion: {
    duration: { instant: 0, fast: 100, normal: 160, slow: 240 },
    easing: {
      standard: "cubic-bezier(0.2, 0, 0, 1)",
      entrance: "cubic-bezier(0, 0, 0, 1)",
      exit: "cubic-bezier(0.3, 0, 1, 1)",
    },
  },
  size: {
    icon: { sm: 16, md: 20, lg: 24, xl: 32 },
    control: { sm: 36, md: 44, lg: 52 },
    avatar: { sm: 24, md: 32, lg: 44, xl: 64 },
  },
  layout: {
    container: { content: 1200, wide: 1280 },
    gutter: { mobile: 16, tablet: 24, desktop: 32 },
    columns: { mobile: 4, tablet: 8, desktop: 12 },
    breakpoint: { sm: 360, md: 768, lg: 1024, xl: 1280 },
  },
  zIndex: { base: 0, sticky: 20, dropdown: 40, overlay: 60, modal: 80, toast: 100 },
} as const;

export const semantic = {
  color: {
    canvas: primitive.color.neutral.canvas,
    surface: {
      default: primitive.color.neutral.white,
      subtle: primitive.color.neutral.surface,
      muted: primitive.color.neutral.muted,
      inverse: primitive.color.navy[950],
      selected: primitive.color.teal[50],
    },
    content: {
      primary: primitive.color.navy[950],
      secondary: primitive.color.navy[600],
      tertiary: primitive.color.navy[500],
      disabled: primitive.color.navy[400],
      inverse: primitive.color.neutral.white,
      link: primitive.color.teal[700],
    },
    border: {
      default: primitive.color.neutral.border,
      subtle: primitive.color.navy[100],
      interactive: primitive.color.neutral.borderStrong,
      focus: primitive.color.teal[500],
      selected: primitive.color.teal[700],
    },
    action: {
      primary: primitive.color.teal[700],
      primaryHover: primitive.color.teal[800],
      primaryPressed: primitive.color.teal[900],
      primaryText: primitive.color.neutral.white,
      secondary: primitive.color.neutral.white,
      secondaryHover: primitive.color.teal[50],
      secondaryText: primitive.color.teal[700],
      quietHover: primitive.color.navy[50],
      disabled: primitive.color.navy[100],
      disabledText: primitive.color.navy[400],
    },
    feedback: {
      success: primitive.color.green[600],
      successSurface: primitive.color.green[50],
      warning: primitive.color.amber[700],
      warningSurface: primitive.color.amber[100],
      danger: primitive.color.rust[700],
      dangerHover: primitive.color.rust[800],
      dangerSurface: primitive.color.rust[50],
      info: primitive.color.blue[600],
      infoSurface: primitive.color.blue[50],
    },
    campaign: {
      yellow: primitive.color.campaign.yellow,
      plum: primitive.color.campaign.plum,
      lavender: primitive.color.campaign.lavender,
      ink: primitive.color.navy[950],
      inverse: primitive.color.neutral.white,
    },
    overlay: "rgba(11, 19, 43, 0.56)",
  },
  typography: {
    display: { fontSize: 52, lineHeight: 60, fontWeight: 800, letterSpacing: -1.5 },
    heading1: { fontSize: 40, lineHeight: 48, fontWeight: 800, letterSpacing: -0.6 },
    heading2: { fontSize: 32, lineHeight: 40, fontWeight: 700, letterSpacing: -0.6 },
    heading3: { fontSize: 24, lineHeight: 32, fontWeight: 700, letterSpacing: -0.6 },
    title: { fontSize: 20, lineHeight: 28, fontWeight: 700, letterSpacing: -0.2 },
    bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: 600, letterSpacing: 0 },
    body: { fontSize: 16, lineHeight: 24, fontWeight: 400, letterSpacing: 0 },
    label: { fontSize: 14, lineHeight: 20, fontWeight: 600, letterSpacing: 0 },
    helper: { fontSize: 14, lineHeight: 20, fontWeight: 400, letterSpacing: 0 },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: 500, letterSpacing: 0.2 },
    numeric: { fontVariantNumeric: "tabular-nums", fontFeatureSettings: "'tnum' 1" },
  },
  motion: {
    feedback: { duration: 100, easing: primitive.motion.easing.standard },
    transition: { duration: 160, easing: primitive.motion.easing.standard },
    overlay: { duration: 240, easing: primitive.motion.easing.entrance },
    reduced: { duration: 0 },
  },
} as const;

export const componentTokens = {
  button: {
    height: { sm: 36, md: 44, lg: 52 },
    paddingInline: { sm: 12, md: 16, lg: 20 },
    gap: 8,
    radius: 8,
  },
  field: {
    height: 48,
    paddingInline: 16,
    radius: 8,
    borderWidth: 1,
    text: semantic.color.content.primary,
    placeholder: semantic.color.content.tertiary,
    background: semantic.color.surface.default,
  },
  card: {
    radius: 12,
    padding: 20,
    border: semantic.color.border.default,
    background: semantic.color.surface.default,
    interactiveShadow: primitive.shadow.raised,
  },
  chip: { height: 28, paddingInline: 10, radius: 999, gap: 6 },
  navigation: { headerHeight: 72, tabUnderline: 2, itemGap: 32 },
  dialog: { width: { sm: 400, md: 560, lg: 720 }, radius: 16, padding: 24 },
  table: { rowHeight: 56, cellPaddingInline: 16, headerBackground: semantic.color.surface.subtle },
  thumbnail: { ratio: { landscape: "16 / 10", project: "4 / 3", avatar: "1 / 1" }, radius: 8 },
} as const;

export type PrimitiveColorFamily = keyof typeof primitive.color;
export type SemanticColorGroup = keyof typeof semantic.color;
export type TextStyle = keyof typeof semantic.typography;
export type SpacingToken = keyof typeof primitive.space;
export type RadiusToken = keyof typeof primitive.radius;
export type Breakpoint = keyof typeof primitive.layout.breakpoint;

export type InteractionState =
  | "default"
  | "hover"
  | "focus"
  | "pressed"
  | "disabled"
  | "loading";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonProps = {
  variant: ButtonVariant;
  size?: ButtonSize;
  state?: InteractionState;
  fullWidth?: boolean;
};

export type FeedbackTone = "neutral" | "info" | "success" | "warning" | "danger";
export type BadgeProps = { tone: FeedbackTone; label: string; iconLabel?: string };
export type FieldState = "default" | "filled" | "error" | "success" | "disabled" | "readOnly";
export type FieldProps = {
  label: string;
  state?: FieldState;
  helperText?: string;
  errorMessage?: string;
  required?: boolean;
};

export type RecruitmentStatus = "SCHEDULED" | "OPEN" | "CLOSED";
export type TransactionStatus = "NONE" | "CONTRACT_PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
export type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type AgreementStatus = "PROPOSED" | "ACCEPTED" | "REJECTED";
export type ContractStatus = "DRAFT" | "SIGNING" | "SIGNED" | "CANCELED";
export type PaymentStatus = "READY" | "PENDING" | "PAID" | "FAILED" | "RELEASED" | "REFUNDED";
export type DeliveryStatus = "IN_PROGRESS" | "DELIVERY_REQUESTED" | "APPROVED";

export const statusPresentation = {
  recruitment: {
    SCHEDULED: { label: "모집 예정", tone: "info" },
    OPEN: { label: "모집 중", tone: "success" },
    CLOSED: { label: "모집 마감", tone: "neutral" },
  },
  transaction: {
    NONE: { label: "거래 전", tone: "neutral" },
    CONTRACT_PENDING: { label: "계약 대기", tone: "warning" },
    IN_PROGRESS: { label: "작업 중", tone: "info" },
    COMPLETED: { label: "완료", tone: "success" },
    CANCELED: { label: "취소됨", tone: "danger" },
  },
  application: {
    PENDING: { label: "검토 중", tone: "warning" },
    ACCEPTED: { label: "선정", tone: "success" },
    REJECTED: { label: "미선정", tone: "neutral" },
  },
  agreement: {
    PROPOSED: { label: "응답 대기", tone: "warning" },
    ACCEPTED: { label: "합의 완료", tone: "success" },
    REJECTED: { label: "합의 거절", tone: "danger" },
  },
  contract: {
    DRAFT: { label: "작성 중", tone: "neutral" },
    SIGNING: { label: "서명 중", tone: "warning" },
    SIGNED: { label: "체결", tone: "success" },
    CANCELED: { label: "무효", tone: "danger" },
  },
  payment: {
    READY: { label: "결제 전", tone: "neutral" },
    PENDING: { label: "처리 중", tone: "warning" },
    PAID: { label: "결제 완료", tone: "success" },
    FAILED: { label: "결제 실패", tone: "danger" },
    RELEASED: { label: "정산 완료", tone: "success" },
    REFUNDED: { label: "환불", tone: "info" },
  },
  delivery: {
    IN_PROGRESS: { label: "작업 중", tone: "info" },
    DELIVERY_REQUESTED: { label: "검토 요청", tone: "warning" },
    APPROVED: { label: "승인", tone: "success" },
  },
} as const;

export type ProjectCardProps = {
  title: string;
  clientName: string;
  category: string;
  budgetAmount: number;
  currency: "KRW";
  deadline: string;
  daysRemaining: number;
  workMode: "REMOTE" | "HYBRID" | "ONSITE";
  skills: readonly string[];
  recruitmentStatus: RecruitmentStatus;
  saved: boolean;
  thumbnailUrl?: string;
};

export type MoneyBreakdownItem = {
  label: string;
  rationale: string;
  amount: number;
  editable?: boolean;
};

export type MoneyBreakdownProps = {
  kind: "PROJECT_BUDGET" | "APPLICATION_AMOUNT" | "AGREED_AMOUNT" | "PAYMENT" | "EXPECTED_PAYOUT";
  currency: "KRW";
  items: readonly MoneyBreakdownItem[];
  total: number;
  sourceLabel: string;
  recordedAt: string;
};

export type EvidenceItem = {
  fact: string;
  source: string;
  actor?: string;
  recordedAt: string;
  referenceId?: string;
};

export type PermissionAwareAction = {
  id: string;
  label: string;
  available: boolean;
  blockedReason?: string;
  recoveryPath?: string;
};

export type PageTemplate = "discovery" | "stepForm" | "detailAction" | "workspace";
```

## 4. 상태와 색 사용 규칙

1. 업무 상태와 표현 tone을 하나의 enum으로 합치지 않는다. 업무 상태는 도메인 사실이고 tone은 표현 방식이다.
2. 상태는 색만으로 전달하지 않는다. 읽을 수 있는 라벨과 필요한 경우 아이콘·설명을 함께 제공한다.
3. 공개 프로젝트 화면에는 모집 상태만 노출한다. 거래·계약·결제 상태는 권한이 있는 당사자 화면에서만 제공한다.
4. 위험 색은 실패, 임박한 기한, 되돌릴 수 없는 행동에만 쓴다. 단순 강조나 마케팅에는 쓰지 않는다.
5. 성공 색은 실제로 완료되었거나 검증된 사실에만 쓴다. 처리 중인 상태를 성공처럼 보이게 하지 않는다.
6. 캠페인 색은 마케팅 콘텐츠의 주제를 설명할 때만 쓴다. 폼, 표, 계약 요약의 구조색으로 사용하지 않는다.

기한은 절대 날짜와 상대 기한을 함께 표시한다. 기본 제안은 `D-8 이상 = neutral`, `D-7~D-4 = warning`, `D-3 이하·연체 = danger`이며, 색과 함께 `D-day` 문구를 항상 제공한다. 정책상 다른 임계값이 확정되면 표현 tone만 바꾸고 원본 마감일은 바꾸지 않는다.

## 5. 타이포그래피와 정보 위계

- 한국어 가독성을 기준으로 Pretendard 계열을 우선 사용하고 운영체제 기본 산세리프로 안전하게 폴백한다.
- 랜딩의 큰 헤드라인을 제외한 업무 화면에서는 과도한 크기 대비를 피한다.
- 금액, 날짜, D-day, 통계는 자릿수가 흔들리지 않도록 tabular numerals를 사용한다.
- 제목은 문맥을 만들고, 라벨은 항목을 식별하며, 보조 문구는 이유나 다음 행동을 설명한다. 보조 문구로 핵심 정보를 숨기지 않는다.
- 한 화면에서 굵은 텍스트를 남발하지 않는다. 제목, 핵심 금액, 현재 단계에 우선순위를 준다.

## 6. 레이아웃과 반응형

- 데스크톱은 12열, 태블릿은 8열, 모바일은 4열을 기준으로 한다.
- 본문 폭은 기본 1200, 콘텐츠가 많은 탐색·워크스페이스는 최대 1280을 사용한다.
- 데스크톱의 목록+상세, 본문+사이드 행동 구조는 모바일에서 읽기 순서에 따른 단일 흐름으로 전환한다.
- 모바일의 필터는 별도 계층으로 열고, 복잡한 금액 비교는 전체 폭 단계로 제공한다.
- 주요 조작 영역은 최소 44×44를 확보한다.
- 320 폭, 200% 확대, 긴 한글·영문, 큰 금액, 빈 값에서 정보가 잘리거나 행동이 사라지지 않아야 한다.

## 7. 이미지와 아이콘

### 이미지

- 홈·탐색: 실제 결과물, 작업 장면, 프로젝트 맥락을 우선한다.
- 예산 분석: 유사 프로젝트의 근거 썸네일에만 사용한다.
- 워크스페이스: 산출물, 첨부 파일, 담당자 아바타에만 사용한다.
- 장식만을 위한 스톡 이미지, 3D 오브젝트, 무관한 인물 사진은 사용하지 않는다.
- 썸네일은 서로 다른 콘텐츠를 실제로 구분해야 하며 같은 이미지를 반복해 풍부함을 흉내 내지 않는다.

### 아이콘

- 카테고리 아이콘은 한 계열의 선 굵기와 시점을 유지하되 각 분야의 실제 대상을 구체적으로 표현한다.
- 기능 아이콘은 텍스트를 대체하지 않고 인식 속도를 보조한다.
- 로봇, 마법봉, 스파클을 AI의 기본 상징으로 사용하지 않는다. AI 기능은 분석 근거와 결과 구조로 설명한다.
- 아이콘만으로 위험·상태·행동을 전달할 때는 접근 가능한 이름을 제공한다.

## 8. 핵심 컴포넌트와 도메인 패턴

### Foundation 컴포넌트

- Action: Button, IconButton, Link
- Form: TextInput, Textarea, MoneyInput, DateField, Select, MultiSelect, Checkbox, Radio, SearchField
- Navigation: Header, Tabs, Stepper, Pagination, Breadcrumb
- Data: Card, Table, DescriptionList, Avatar, Tag, Badge
- Feedback: InlineMessage, Alert, Toast, Skeleton, EmptyState, ErrorState
- Overlay: Dialog, Drawer, Popover, Tooltip
- File: FileUpload, AttachmentRow, FilePreview

### 도메인 패턴

- `ProjectCard`: 프로젝트를 비교하는 데 필요한 예산, 기한, 작업 방식, 기술, 모집 상태를 같은 순서로 제공한다.
- `ProjectStatusSummary`: 역할과 권한에 맞는 상태 축만 조합한다.
- `PermissionAwareActions`: 서버가 허용한 행동을 기준으로 노출하며, 불가능한 행동은 이유와 대안을 설명한다.
- `ProjectBriefSummary`: 등록 단계에서 입력한 내용을 최종 확인 가능한 단위로 묶는다.
- `MoneyBreakdown`: 금액 종류, 산식, 출처, 기록 시점을 보존한다.
- `AgreementOffer`: 제안자, 대상, 버전, 금액, 유효기간, 응답 상태를 한 사실 단위로 표현한다.
- `EvidenceRow`: 주장, 출처, 행위자, 기록 시각, 식별자를 연결한다.
- `AuditTimeline`: 제안, 수정, 수락, 거절, 서명, 결제 이벤트를 시간 순서로 보존한다.
- `DeadlineIndicator`: 절대 날짜와 상대 기한을 함께 제공한다.
- `VersionConflictRecovery`: 사용자가 본 내용과 최신 내용을 비교하고 안전하게 다시 행동하게 한다.
- `DestructiveActionSummary`: 되돌릴 수 없는 결과와 영향받는 대상을 실행 전에 설명한다.

## 9. 상호작용 상태 완료 기준

| 대상 | 필수 상태 |
|---|---|
| 행동 | default, hover, focus, pressed, disabled, loading |
| 입력 | empty, filled, focus, error, success, disabled, readOnly |
| 선택 | unselected, selected, mixed, disabled |
| 데이터 카드 | default, hover, focus, saved/selected, unavailable |
| 비동기 영역 | idle, loading, success, empty, error, stale/conflict |
| 파괴 행동 | available, confirmation, processing, completed, rejected |

모든 비동기 행동은 중복 실행을 막고, 완료 후 결과 요약을 남긴다. 북마크처럼 빈번한 토글은 낙관적으로 반영할 수 있지만 실패하면 이전 상태와 이유를 복원한다.

## 10. 접근성 기준

- 일반 텍스트는 4.5:1, 큰 텍스트는 3:1, 필수 UI 경계와 아이콘은 3:1 이상의 대비를 확보한다.
- 기본 본문, 링크, 주요 행동, 위험·성공 텍스트 토큰은 흰 배경에서 AA 대비를 만족한다.
- 비본질 구분선은 낮은 대비를 사용할 수 있지만 입력 경계와 포커스는 별도 강한 토큰을 사용한다.
- 모든 기능은 키보드로 실행 가능하고, 포커스가 사라지거나 예상하지 못한 위치로 이동하지 않아야 한다.
- 오류 요약과 개별 입력 오류를 연결하고, 비동기 상태 변화는 보조 기술에 전달한다.
- `prefers-reduced-motion`에서는 의미 없는 이동을 제거하고 상태 변화는 즉시 반영한다.

## 11. V5 화면 적용 매핑

| 화면 | 시각적 중심 | 시스템 적용 |
|---|---|---|
| 홈 | 검색, 실제 작업 사례, 카테고리 | 캠페인 색의 범위 제한, 실제 콘텐츠 썸네일, 큰 한국어 헤드라인 |
| 프로젝트 탐색 | 필터와 비교 가능한 프로젝트 | 중립 필터, 동일한 정보 순서, 기한·예산·기술의 숫자 위계 |
| 일정·예산 입력 | 단계와 정확한 입력 | 조용한 폼 구조, 입력 보존, 우측 유사 프로젝트 근거 |
| 예산 분석 | 추천액과 산정 내역 | 추천과 확정의 분리, tabular 숫자, 수정 가능한 원장형 내역 |
| 거래 워크스페이스 | 산출물과 검토 기록 | 파일 중심 레이아웃, 역할별 상태, 계약 사실, 활동 이력 |

## 12. 금지 패턴

- 사용 목적이 없는 그라데이션과 다색 카드
- 흰 카드가 떠 있는 것처럼 보이기 위한 과도한 그림자
- 정보가 거의 없는 거대한 여백과 큰 문구
- 모든 영역을 같은 반경의 카드로 감싸는 구성
- 증거 없이 AI가 계산했다는 사실만 강조하는 표현
- 정확한 사실보다 친근한 말투를 우선하는 오류 안내
- 상태, 오류, 선택을 색 하나로만 구분하는 표현
- 한 화면에서 동일한 중요도의 주요 행동을 여러 개 경쟁시키는 구성
- 마감이나 손실을 과장해 클릭을 유도하는 문구

## 13. 모션 규칙 (2026-08-28 추가)

`primitive.motion.duration`·`primitive.motion.easing`·`semantic.motion.*` 토큰은 §3에 값만
정의되어 있고 실제로 쓰는 화면이 없었다. 아래는 그 값을 **언제·어떻게** 쓰는지에 대한 규칙이다 —
정본은 이 문서다.

### 리스트 등장 애니메이션 (stagger)

- 같은 컴포넌트가 여러 개 나열될 때, 왼쪽→오른쪽·위→아래 순서로 하나씩 나타난다 — 읽기 순서와
  일치시킨다.
- 각 항목은 `primitive.space[2]`(8px) 아래에서 시작해 원래 위치로 슬라이드하면서 동시에
  투명(0)에서 불투명(1)으로 페이드인한다. 시작 지점은 8px를 넘지 않는다 — 멀리서 날아오는
  느낌은 절제를 벗어난 장식으로 읽힌다(§2 시각 방향, §12 금지 패턴과 같은 이유).
- 지속시간은 `semantic.motion.transition`(160ms) + `primitive.motion.easing.entrance`를 쓴다.
- 항목 간 시작 간격(stagger delay)은 40ms를 기본값으로 하되, **처음 8개 항목까지만 순차
  적용**하고 9번째부터는 지연 없이 즉시 표시한다. 항목이 많을수록 순차 등장이 "아직 로딩
  중"이라는 오해를 준다(`ux-philosophy.md` 원칙 1 — 추측을 맡기지 않는다).
- **최초 진입(mount) 시에만** 적용한다. 같은 목록이 필터·정렬·페이지네이션으로 다시 그려질 때는
  반복하지 않는다 — 조작할 때마다 화면이 느려 보이는 것을 막기 위해서다.

### 퇴장 애니메이션

- 목록에서 항목이 사라질 때(북마크 해제, 필터로 제외 등)는 등장의 대칭으로 처리한다 —
  `primitive.motion.easing.exit` + `semantic.motion.transition`(160ms)로 페이드아웃하면서 위로
  8px 이동한다.

### 마이크로 인터랙션 (hover · focus · pressed)

- 버튼·카드 등 상호작용 요소의 상태 전환(§9)은 `semantic.motion.feedback`(100ms, standard
  easing)을 쓴다. 등장 애니메이션(160~240ms)보다 짧게 유지해 "누르면 바로 반응한다"는 감각을
  지킨다.

### 오버레이 (모달 · 다이얼로그)

- `semantic.motion.overlay`(240ms, entrance easing)를 쓴다. 배경 딤(`semantic.color.overlay`)과
  다이얼로그 본체가 함께 페이드인한다.

### 금지 — 카운트업 애니메이션

- 금액·정산액·평점 등 핵심 사실을 숫자가 스르륵 올라가는 방식으로 보여주지 않는다. 이런 값은
  즉시·정확하게 표시한다 — "정확한 사실보다 친근한 연출을 우선하지 않는다"(§12)는 원칙과 같은
  이유다.

### 접근성 — `prefers-reduced-motion`

- 위 모든 애니메이션은 `prefers-reduced-motion: reduce`에서 `semantic.motion.reduced`
  (duration 0)로 대체한다 — 이동 없이 즉시 최종 상태로 나타난다(§10과 동일 요구사항을 모션에
  한정해 구체화한 것).

## 14. 완료 체크리스트

- [ ] TS 토큰은 `as const`로 고정되어 있고 타입이 토큰에서 추론된다.
- [ ] HTML 프리뷰의 토큰 값이 이 문서와 일치한다.
- [ ] 컴포넌트 상태와 도메인 상태가 분리되어 있다.
- [ ] 모집·거래·지원·합의·계약·결제·납품 상태가 서로 섞이지 않는다.
- [ ] 공개 화면에 당사자 전용 거래 정보가 노출되지 않는다.
- [ ] 금액 종류와 확정 수준이 명확히 구분된다.
- [ ] 의미 없는 색·이미지·AI 장식이 없다.
- [ ] 키보드, 대비, 확대, 모바일 폭, 긴 콘텐츠 검수를 통과한다.
- [ ] 리스트 등장 애니메이션이 최초 진입에만 적용되고, 9번째 항목부터는 지연 없이 즉시
      표시된다(§13).
- [ ] 금액 등 핵심 사실에 카운트업 애니메이션을 쓰지 않았다(§13).
- [ ] `prefers-reduced-motion`에서 애니메이션 없이 즉시 최종 상태로 표시된다(§13).
