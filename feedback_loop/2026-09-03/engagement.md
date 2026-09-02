# engagement 피드백 — 2026-09-03 통합 (CR-0010)

반영 커밋(prototype 기준): 1de2646 (39b7c89 추천 사유 + 1de2646 GET /bookmarks/ids, CR-0008.
3e4977e 이후 CR-0010이 요청한 범위)
sync-log.md 기록: 있음 — mark-synced.sh 실행 후

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 추천 사유 줄에 시안에 없는 `.caption` 클래스를 재사용했다

상태: 미확인

**Fact — design/*.html에 정의되지 않은 부분**
- `features/engagement/design/high-fi-bookmarks.html`의 SCR-B09(추천 프로젝트)에는 추천
  사유를 보여주는 줄 자체가 없다 — CR-0006(추천 사유 표시)이 시안 작성 이후에 나온 결함이라
  시안이 갱신되지 않았다.
- prototype `RecommendationSection.tsx`는 `.reco__why`라는 새 클래스를 만들어 사유를
  표시했는데, 이 클래스는 `features/engagement/design/_tokens.css`에 없다.

**어떻게 채웠는지**
- `app/web/src/features/engagement/RecommendationSection.tsx`에서 새 클래스를 만들지 않고,
  같은 `.pcard` 안에서 이미 쓰이는 `.caption`(시안 SCR-B01 카드의 카테고리 줄과 같은 클래스,
  `shared/ui/tokens.css`에 이미 정의됨)으로 사유 줄을 그렸다.

**왜 그렇게 채웠는지 (근거)**
- `npm run check:design`은 `features/*/design/_tokens.css`의 클래스가 `app/web`에 있는지만
  본다 — 시안에 없는 새 클래스(`.reco__why`)를 app에서 만들면 그 자체로는 검사에 걸리지
  않지만, 시안이 정의하지 않은 스타일을 팀장이 임의로 짓는 셈이라 기존 토큰화된 클래스를
  재사용하는 쪽을 택했다. 시각적으로는 `.caption`(12px, `--content-tertiary`)이 사유 문구
  같은 보조 정보에 맞는 톤이라고 판단했다.

**담당자 메모**
- {검토 후 자유 기재. `.reco__why` 같은 전용 클래스가 필요하다고 보면(예: 다른 폰트 굵기·색이
  필요하면) 시안에 반영해 주면 다음 통합에서 그대로 옮긴다}

---

## 항목 2 — [참조] project-management의 예산 출처(ERD) 판단

본문 위치: `feedback_loop/2026-09-03/project-management.md` 항목 3 참조 —
`budgetSource`/`budgetSourceAt`는 project-management 소유 필드이지만, engagement가 같은
CR-0010으로 함께 반영돼 날짜 폴더가 겹쳐 참조만 남긴다.

상태: 미확인

---
