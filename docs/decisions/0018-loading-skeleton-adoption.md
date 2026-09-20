# 로딩 중 화면을 박스 스켈레톤으로 통일

| 항목 | 내용 |
|---|---|
| 상태 | 결정됨 — 구현 대기 (담당자 배정 필요) |
| 기준 | 2026-09-14 코드 전수조사 (`app/web/src` 전체) |
| 범위 | 데이터를 불러오는 동안 화면에 무엇을 보여줄 것인가 (UI만, API·데이터 구조는 바꾸지 않음) |
| 원칙 | 기존 `design-tokens.md`에 이미 이름만 있던 `Skeleton`을 실제로 정의한다. 새 색·새 반경·새 그림자를 만들지 않는다 |

## 왜 이 문서를 읽어야 하는가 (Context)

지금 앱 여러 화면에서 데이터를 불러오는 동안 "불러오는 중입니다…"라는 글자가 화면 가운데(혹은 목록이 있어야 할 자리)에 나타났다가, 데이터가 도착하면 그 글자가 사라지고 실제 내용이 나타난다. 인터넷이 빠른 환경에서는 이 전환이 너무 빨라서 화면이 "깜빡이는" 것처럼 보인다 — 글자가 있다가, 없다가, 내용이 뜨는 3단계가 순식간에 일어나기 때문이다.

이건 사소한 눈속임 문제가 아니라 실제로 발생 중인 사용자 경험 결함이다. 팀장이 이번에 프로젝트 목록·상세·지원 내역 등 실사용 화면을 직접 훑으면서 확인했다.

## 어떤 문제가 있는가 (Problem)

**Fact** — `app/web/src` 전체를 검색한 결과, "불러오는 중입니다" 문구를 쓰는 화면은 17곳이다.

**Fact** — 이 17곳 중 정확히 하나의 시각 패턴만 쓰인다: `{loading && <p className="status-line" role="status">불러오는 중입니다…</p>}`. `loading`이 `false`가 되는 순간 이 `<p>` 태그 자체가 화면에서 통째로 사라지고, 그 자리에 실제 콘텐츠가 새로 나타난다. React 관점에서 이것은 "다른 내용으로 바뀜"이 아니라 "한 엘리먼트가 사라지고 전혀 다른 엘리먼트가 나타남"이다 — 깜빡임의 원인이 정확히 여기 있다.

**Fact** — 이 중 8곳(`contracts-payments`의 `AgreementPanel`·`ContractSignPanel`·`CancellationPanel`·`SettlementPanel`·`DeliveryPanel`·`PaymentPage`, `applications`의 `ManageApplicantsPage`, `reviews`의 `ReviewPage`)은 이미 글자 아래에 회색 막대(`<div className="skeleton" />`, `app/web/src/features/contracts-payments/panel.css:127`)를 2개씩 같이 쓰고 있다. 즉 "박스 스켈레톤을 쓰자"는 아이디어는 이미 부분적으로 시도됐던 것이다 — 다만 (1) 애니메이션이 전혀 없는 고정 회색 막대이고 (2) 높이 12px 막대 하나의 모양뿐이라 카드·버튼·아바타 등 실제 콘텐츠 모양과 안 맞고 (3) `contracts-payments` 기능에만 있고 나머지 9곳(`ProfilePage`·`ProjectManagePage`·`MyApplicationsPage`·`ProjectDetailPage`·`ProjectEditPage`·`DevAuthToggle`·`RecruitingProjects`·`ProjectBrowsePage`·`MyBookmarksPage`)에는 아예 없다.

**Fact** — `design-system/design-tokens.md` 455번째 줄은 처음부터 `Skeleton`을 Feedback 컴포넌트 목록에 넣어뒀다. 즉 "언젠가 만든다"는 계획은 있었지만 실제 시각 규격(색, 모양, 애니메이션 속도)을 정의한 적이 없다 — 그래서 각 담당자가 각자 다른 방식(어떤 곳은 글자만, 어떤 곳은 글자+고정 막대)으로 구현했다.

**Assumption** — "화면이 점멸하는 듯한 효과"는 빠른 네트워크·로컬 개발 환경에서 두드러진다는 것이 팀장의 체감이다. 실제 사용자 회선 속도별 발생 빈도를 측정한 자료는 없다.

## 알아야 할 개념 (Concept)

**스켈레톤 스크린(skeleton screen)이란** — 로딩 중이라는 문장을 보여주는 대신, 실제 콘텐츠가 나타날 자리에 그 콘텐츠와 같은 크기·모양의 회색 상자를 미리 보여주는 방식이다. 카드가 나타날 자리에는 카드 모양 상자, 글줄이 나타날 자리에는 글줄 모양의 가느다란 상자를 놓는다. 데이터가 도착하면 상자가 실제 내용으로 "채워지는" 느낌을 준다. 스피너(빙글빙글 도는 아이콘)나 지금 쓰는 텍스트 문구와 달리, 로딩 중에도 화면 레이아웃이 미리 잡혀 있어서 내용이 도착했을 때 화면이 밀리거나(레이아웃이 갑자기 변하는 현상, CLS라고 부른다) 깜빡이지 않는다.

**시머(shimmer) 효과란** — 스켈레톤 상자 위로 살짝 밝은 빛줄기가 왼쪽에서 오른쪽으로 천천히 스쳐 지나가는 애니메이션이다. "로딩 중"이라는 상태를 동적으로 알려주면서도, 점멸(깜빡임)과 달리 부드럽게 반복되기 때문에 거슬리지 않는다. 배터리·접근성을 위해 "애니메이션 줄이기" 설정을 켠 사용자에게는 이 효과를 끄고 정지된 회색 상자만 보여줘야 한다(디자인 시스템 §10 접근성 기준, §13 모션 규칙에 이미 있는 원칙과 동일).

## 선택지 (Options)

**A. 지금처럼 텍스트만 유지** — 아무것도 바꾸지 않는다.
**B. 스피너(회전 아이콘)로 교체** — 업계에서 흔히 쓰는 또 다른 방식.
**C. 박스 스켈레톤 + 시머로 통일, 디자인 시스템에 정식 등록** — 사용자가 요청한 방향이자, 이미 `design-tokens.md`가 예고해 둔 컴포넌트를 실제로 완성하는 방향.

## 비교 (Comparison)

| 기준 | A. 유지 | B. 스피너 | C. 박스 스켈레톤 |
|---|---|---|---|
| 깜빡임 해결 | 해결 안 됨 | 부분 해결(문구 대신 아이콘도 사라졌다 나타나는 건 동일) | 해결됨 — 컨테이너는 유지되고 내용만 채워짐 |
| 레이아웃 밀림(CLS) | 있음 | 있음 | 없음(상자가 미리 실제 콘텐츠 크기를 차지) |
| 구현 난이도 | 없음 | 낮음 | 중간 — 화면마다 콘텐츠 모양이 달라 상자 모양을 몇 종류 설계해야 함 |
| 기존 코드 재사용 | - | - | 8곳에 이미 있는 `.skeleton` 막대를 확장하는 형태라 완전히 새로 만드는 것보다 적게 든다 |
| 최신 트렌드 부합 | 아니오 | 다소 구식으로 인식됨 | 예 — 사용자가 지목한 방향과 일치 |
| 유지보수성 | - | 낮음(화면마다 다른 아이콘 크기로 번질 위험) | 높음 — 토큰 기반 공용 컴포넌트 하나로 관리 |

## 추천안 (Recommendation)

**Opinion** — C안(박스 스켈레톤 통일)을 추천한다. 이미 두 가지 근거가 있다: (1) `design-tokens.md`가 처음부터 `Skeleton`을 계획해 뒀다는 점, (2) 8개 화면이 이미 부분적으로 회색 막대를 쓰고 있어 "전면 신규 도입"이 아니라 "기존 시도를 완성하고 나머지 9곳에 확장"하는 작업이라는 점이다. A안은 사용자가 지적한 문제를 그대로 둔다. B안은 요청하신 방향(박스 스켈레톤)과 다르고 깜빡임의 근본 원인(레이아웃이 잡혔다 사라짐)을 해결하지 못한다.

## 결정 (Decision)

1. `design-tokens.md`에 §14로 Skeleton 컴포넌트의 실제 시각·모션·접근성 규격을 정의한다(새 색·새 반경 토큰은 만들지 않고 기존 `semantic.color.surface.muted/subtle`, `primitive.radius`, `primitive.motion`만 재사용한다).
2. `app/web/src/shared/ui/`에 공용 `Skeleton` 컴포넌트를 새로 만들고, `contracts-payments`의 기존 `.skeleton` 막대를 이 컴포넌트로 교체한다(모양 3종: 글줄형 · 카드형 · 목록행형).
3. 나머지 9개 화면(텍스트만 있던 곳)에 같은 컴포넌트를 새로 적용한다 — 상세 매핑은 아래 §Next Action의 표를 따른다.
4. 시각적으로 사라지는 "불러오는 중입니다" 문구는 화면에서 제거하되, 스크린리더 사용자를 위해 `sr-only`(화면에는 안 보이고 보조기술만 읽는) 텍스트로 남긴다 — §10 접근성 기준의 "비동기 상태 변화를 보조 기술에 전달"을 계속 지킨다.
5. `prefers-reduced-motion: reduce`에서는 시머 애니메이션을 끄고 정지된 상자만 보여준다 — §13 모션 규칙과 동일한 예외 처리를 그대로 따른다.

## 다음 작업 (Next Action)

| 순서 | 무엇을 | 누가 | 상태 |
|---|---|---|---|
| 1 | `design-tokens.md` §14 Skeleton 스펙 확정 | 팀장 | 이 커밋에서 완료 |
| 2 | `Skeleton.tsx` 공용 컴포넌트 구현 | 담당 미정 | 대기 |
| 3 | `contracts-payments` 8개 파일 — 기존 `.skeleton` 막대를 신규 컴포넌트로 교체 | 조준영 구간 담당자 | 대기 |
| 4 | 목록형 3개(`ProjectBrowsePage`, `RecruitingProjects`, `ProjectManagePage`) — 카드형 스켈레톤 적용 | project-management 담당자 | 대기 |
| 5 | 나머지 6개(`ProfilePage`, `MyApplicationsPage`, `ProjectDetailPage`, `ProjectEditPage`, `DevAuthToggle`, `MyBookmarksPage`) — 글줄/폼형 스켈레톤 적용 | 각 기능 담당자 | 대기 |
| 6 | 적용 후 `prefers-reduced-motion` 켠 상태로 수동 확인 | 각 담당자 | 대기 |

### 화면별 스켈레톤 모양 매핑 (근거: 2026-09-14 코드 전수조사)

| 파일 | 현재 상태 | 콘텐츠 모양 | 적용할 스켈레톤 |
|---|---|---|---|
| `project-management/ProjectBrowsePage.tsx` | 텍스트만 | 프로젝트 카드 그리드 | 카드형 × N (최대 8개, §13 stagger 규칙 재사용) |
| `project-management/home/RecruitingProjects.tsx` | 텍스트만 | 홈 섹션 카드 목록 | 카드형 × N |
| `project-management/ProjectManagePage.tsx` | 텍스트만 | 내 프로젝트 카드 목록 | 카드형 × N |
| `project-management/ProjectDetailPage.tsx` | 텍스트만 | 상세 정보 패널 | 글줄형 스택(제목·본문·메타 순서로 높이 다르게) |
| `project-management/ProjectEditPage.tsx` | 텍스트만 | 입력 폼 | 폼 필드형(라벨+인풋 높이 48px 블록 반복, `componentTokens.field` 재사용) |
| `applications/MyApplicationsPage.tsx` | 텍스트만 | 지원 내역 목록행 | 목록행형 |
| `applications/ManageApplicantsPage.tsx` | 막대 2개(고정) | 지원자 목록행 | 목록행형으로 교체 |
| `user-management/ProfilePage.tsx` | 텍스트만 | 프로필 정보 패널 | 글줄형 스택 |
| `user-management/DevAuthToggle.tsx` | 텍스트만 | 개발용 계정 목록(로컬 전용) | 목록행형(우선순위 낮음 — 팀 내부 도구) |
| `engagement/MyBookmarksPage.tsx` | 텍스트만 | 북마크 카드 목록 | 카드형 × N |
| `reviews/ReviewPage.tsx` | 막대 2개(고정) | 리뷰 작성/조회 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/AgreementPanel.tsx` | 막대 2개(고정) | 합의 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/ContractSignPanel.tsx` | 막대 2개(고정) | 계약 서명 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/CancellationPanel.tsx` | 막대 2개(고정) | 취소 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/SettlementPanel.tsx` | 막대 2개(고정) | 정산 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/DeliveryPanel.tsx` | 막대 2개(고정) | 납품 패널 | 글줄형 스택으로 교체 |
| `contracts-payments/PaymentPage.tsx` | 막대 1개(고정) | 결제 패널 | 글줄형 스택으로 교체 |

이 표의 "적용할 스켈레톤" 모양 3종(카드형·글줄형·목록행형)과 각각의 정확한 크기·반경·애니메이션 값은 `design-system/design-tokens.md` §14를 정본으로 따른다.
