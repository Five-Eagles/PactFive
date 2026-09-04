/**
 * 금액이 어디서 왔는지 보여준다
 *
 * `design-system/design-tokens.md` §8 의 `MoneyBreakdown` 패턴이고,
 * `ux-philosophy.md` §6 "근거 이해 — 금액·추천·승인의 출처와 확정 수준을 구분한다"
 * 를 충족하기 위한 것이다.
 *
 * ## 왜 필요한가 (CR-0006 결함 2)
 *
 * 규칙 8 은 `pricingAnalysisId` 가 있으면 **사용자가 입력한 금액을 버리고
 * AI 분석 금액으로 덮어쓴다.** 서버 동작은 맞다 — 클라이언트가 보낸 값을 신뢰하지 않는다.
 *
 * 그런데 화면에는 그 사실이 없었다. 등록을 마친 의뢰인이 보는 `3,000,000원` 이
 * 자기가 넣은 값인지 AI 가 바꾼 값인지 구분할 방법이 없었다.
 * 제품 컨셉이 `Trust by Evidence` 인데 가장 중요한 숫자에 출처가 없었던 것이다.
 *
 * ## 무엇을 하지 않는가
 *
 * **출처를 화면이 추론하지 않는다.** 서버가 `budgetSource` 를 주고 여기서는 표시만 한다.
 * "분석 id 가 있으니까 AI 겠지" 같은 판정을 화면에 두면 규칙이 두 곳에 생긴다.
 */

import { Money } from "./ui";

/** `projects.budget_source` 와 같은 값이다 */
export type BudgetSource = "CLIENT_INPUT" | "AI_ANALYSIS";

export type MoneyBreakdownProps = {
  amount: number;
  /** 서버가 준다. 없으면 출처를 말하지 않는다 — 지어내지 않는다 */
  source?: BudgetSource;
  /** 출처가 기록된 시각. `2026-09-01T00:00:00Z` */
  sourceAt?: string | null;
  /** 라벨. 기본은 `예산` */
  label?: string;
};

const SOURCE_TEXT: Record<BudgetSource, string> = {
  CLIENT_INPUT: "직접 입력한 금액입니다",
  AI_ANALYSIS: "AI 단가 분석이 제안한 금액입니다",
};

function formatDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}

export function MoneyBreakdown({
  amount,
  source,
  sourceAt,
  label = "예산",
}: MoneyBreakdownProps) {
  return (
    <div className="money-breakdown">
      <p className="money-breakdown__label">{label}</p>
      <p className="money-breakdown__amount">
        <Money amount={amount} />
      </p>

      {/* 출처를 모르면 아무 말도 하지 않는다. 빈 자리가 틀린 설명보다 낫다 */}
      {source && (
        <p className="money-breakdown__source">
          {SOURCE_TEXT[source]}
          {sourceAt && <span className="money-breakdown__at"> · {formatDate(sourceAt)}</span>}
        </p>
      )}

      {/* AI 가 바꾼 값이면 그것을 되돌릴 수 있다는 것까지 알린다.
          §6 선택권 — 추천이 사용자의 결정을 대신하지 않는다 */}
      {source === "AI_ANALYSIS" && (
        <p className="money-breakdown__note">
          지원자가 생기기 전에는 직접 수정할 수 있습니다.
        </p>
      )}
    </div>
  );
}
