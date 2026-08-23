# 디자인 시스템 가이드 (UI·UX 담당자용)

이 문서는 디자인 시스템을 무엇으로, 어떻게 산출해야 하는지 정의하는 가이드입니다. 완성된
디자인 시스템 자체가 아니라 "이렇게 만들어라"는 지침입니다.

## 1. 왜 필요한가

`features/{기능}/design/`에서 각 기능 담당자가 만드는 화면 시안은, 이 디자인 시스템이 나온
뒤부터 high-fi(실제 컴포넌트 적용)로 전환됩니다 (`sdd-framework/feature-workflow.md` 참고).
디자인 시스템이 늦어질수록 나머지 담당자는 low-fi에 머무릅니다 — 가능한 한 빨리 최소 버전을
내는 것이 우선입니다.

## 2. 무엇을 산출해야 하는가 (2가지, 둘 다 필수)

1. **디자인 토큰·컴포넌트 타입 정의** — TS 코드로, `design-system/design-tokens.md`에 작성
2. **통합 인터랙티브 HTML 프리뷰** — 팀원이 브라우저로 열어 눈으로 확인할 수 있는 파일 하나,
   `design-system/design-system-preview.html`

두 산출물은 같은 내용을 다르게 표현한 것입니다. ①은 AI·코드가 그대로 가져다 쓸 원본, ②는
사람이 보고 판단하는 프리뷰입니다.

## 3. TS 패턴 — 현업에서 널리 쓰이는 방식으로 작성

정답은 하나가 아니지만, 아래 패턴이 실무에서 흔히 쓰이고 우리 규모에도 적당합니다. `as const`로
토큰을 고정하고, 컴포넌트 variant는 유니언 타입으로 표현합니다.

```ts
// design-tokens.ts 형태 예시 — design-tokens.md 안의 코드 블록으로 작성
export const colors = {
  trustBlue: "#4f46e5",
  deepNavy: "#1e293b",
  successGreen: "#10b981",
  attentionYellow: "#f59e0b",
  riskRed: "#ef4444",
  neutralGray: "#64748b",
} as const;

export type ColorToken = keyof typeof colors;

export const typography = {
  fontFamily: "Pretendard, -apple-system, sans-serif",
  scale: { xs: 12, sm: 14, base: 16, lg: 18, xl: 24, "2xl": 32 } as const,
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// 컴포넌트 variant는 문자열 유니언으로 — cva/shadcn류에서 흔히 쓰는 형태
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type BadgeStatus = "success" | "warning" | "danger" | "neutral";

export type ButtonProps = {
  variant: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
};
```

`colors`, `typography`, `spacing`은 예시 값입니다 — 실제 값은 팀이 확정한 프로젝트 컨셉(색상
팔레트·타이포그래피)을 그대로 넣습니다. 형태(패턴)만 이대로 유지하면 됩니다.

## 4. 인터랙티브 HTML 프리뷰 요구사항

- 파일 하나로 동작해야 합니다 (별도 빌드 과정 없이 브라우저에서 바로 열림).
- 팀이 이미 쓰고 있는 Presentation System(Tailwind CDN + 공통 CSS 클래스)을 재사용하는 것을
  권장합니다 — 새 스타일을 처음부터 만들 필요 없습니다.
- 아래 섹션을 포함합니다: 컬러 팔레트(스와치+토큰명), 타이포그래피 스케일, 스페이싱, 대표
  컴포넌트 샘플(Button, Badge, Card 등 variant별로 실제 렌더링).
- §3의 TS 토큰 값과 반드시 일치해야 합니다 (프리뷰 색상이 토큰 hex와 다르면 안 됨).

## 5. 산출물 위치

| 파일 | 역할 |
|---|---|
| `design-system/design-tokens.md` | TS 토큰·타입 정의 (AI·코드가 참고하는 원본) |
| `design-system/design-system-preview.html` | 팀원이 눈으로 확인하는 인터랙티브 프리뷰 |

## 6. 체크리스트

- [ ] 토큰이 `as const`로 고정되어 있고, 타입이 토큰에서 추론되는가
- [ ] variant/상태값이 문자열 유니언 또는 enum으로 정의되어 있는가
- [ ] 인터랙티브 HTML이 파일 하나로 열리는가 (외부 빌드 불필요)
- [ ] HTML의 색상·타이포·스페이싱이 §3 TS 토큰 값과 일치하는가
- [ ] 기존 Presentation System 스타일을 재사용했는가 (새 스타일 임의 생성 지양)
