/**
 * main.html `.resume` — 로그인한 의뢰인에게 "내 프로젝트 진행 상황"을 요약해 보여주는 자리.
 *
 * **버튼이 아니라 데이터가 없는 경우다.** 진행 단계·납품 파일은 계약 이후 데이터라 조준영
 * 쪽 Step 2 포트가 생기기 전엔 채울 수 없다 — NotYet 다이얼로그로 대체할 내용 자체가 없어
 * `ComingSoonOverlay`도 맞지 않는다. 지금은 자리와 "곧 보인다"는 사실만 정직하게 알린다
 * (homepage-transplant-plan.md 5번 절).
 *
 * 비로그인 사용자에게는 이 섹션 자체를 마운트하지 않는다 — 시안도 "로그인해야 보이는 자리"로
 * 못 박아 뒀다.
 */
export type ResumeSummaryProps = {
  visible: boolean;
};

export function ResumeSummary({ visible }: ResumeSummaryProps) {
  if (!visible) return null;
  return (
    <div className="resume" data-anon="false">
      <div className="resume__main">
        <span className="resume__k">내 프로젝트 진행 상황</span>
        <span className="resume__title">계약이 진행되면 여기에 표시됩니다.</span>
      </div>
    </div>
  );
}
