# ai-pricing 테스트 결과

담당자: 오민혁

## 2026-09-10 실제 배포 정상 견적 재확인 — 503 지속

대상: `https://pact-five-seven.vercel.app/`. client-fresh 실제 로그인 200 후 인증된
`POST /api/v1/pricing-analyses`를 새 Idempotency-Key로 1회 재요청했다. 비밀번호/토큰/쿠키는
기록하지 않는다. 배포 commit은 미확인이고 로컬 코드 대조 기준은 develop `38ab13c`다.

```json
{
  "title": "QA 회원가입 화면 개발",
  "description": "회원가입과 로그인 화면 개발이 필요합니다.",
  "category": "WEB_DEVELOPMENT"
}
```

제목 13자·설명 23자로 최소 길이를 만족한다. 실제 HTTP는 **503**이며 본문은 다음과 같다.

```json
{"error":{"code":"PRICING_ANALYZER_UNAVAILABLE","message":"단가 분석 기능을 사용할 수 없습니다.","details":null}}
```

HTTP는 배포에 별도로 보낸 API 요청에서 측정한 값이며 브라우저 네트워크 캡처가 아니다.
따라서 정상 결과·항목 **1~20개 검증은 BLOCKED**다. 이번 재요청의 응답에는 견적 결과가 없다.
앞선 9/10 QA에서 최소 길이 UI·서버 검증이 통과한 사실과 정상 생성 성공은 구분한다.
서버 설정이 해결됐다는 증거가 없으므로 성공으로 처리하거나 반복 요청하지 않았다.

팀장이 분석기 설정/외부 공급자 연결 상태를 확인한 뒤 동일 조건으로 재실행한다. 성공 HTTP·
실제 analysis ID·반환 항목 개수(1~20)·필수 값·결과 화면 문구를 기록해야 종료할 수 있다.
503만으로 누락된 특정 환경변수나 외부 장애 원인을 확정하지 않는다. app·환경변수·배포 설정은
이번 범위에서 변경하지 않았다.

## 2026-09-08 — 실제 오류와 프리뷰 견적 분리

기준: `develop ec1c01f`를 동기화한 `feature/ai-pricing`, 커밋 전.

### 자동 검증

- [x] `npx tsx features/ai-pricing/prototype/run.tsx` — 30 PASS / 0 FAIL (기존 27 + 신규 3)
- [x] prototype 진입점 strict TypeScript 검사 — PASS
- [x] `npm run preview:build` — PASS, 102 modules
- [x] `git diff --check` — PASS
- [x] 로컬 브라우저에서 토큰 없는 최초 요청·재시도 오류 — 아래 범위 확인
- [ ] 실제 DB·외부 모델·운영 E2E — 이번 수정에서는 실행하지 않음

### 수정·검증 범위

- 최초 실제 분석 요청이 실패하고 `analysis`가 없을 때도 `error` 상태만으로 `pra_preview_1`·
  1,500,000원 보고서와 추천 채택 버튼이 생기던 오류를 수정했다.
- `selectPricingAnalysisForDisplay`는 실제 응답을 우선하고, 샘플은 명시적 `previewState`에서만
  복제해서 반환한다. 실제 결과 없음은 `null`로 유지한다. 화면 레이아웃·문구·API 계약은 바꾸지 않았다.
- 규칙 14 검증: S2-R22 일반 화면 결과/CTA 없음과 페이지의 selector 연결, S2-R23 명시적 프리뷰
  상태·샘플 객체 격리, S2-R24 실제 승인/대기/거절 응답의 우선·보존을 검사한다.
- 규칙 1~13은 아래 9/4 대응표의 기존 테스트를 그대로 재실행한다.
- 자동 검증은 순수 selector·SSR·Mock 회귀다. 브라우저에서는 아래 최초 인증 오류 흐름을 실행했다.
  실제 계정·DB·외부 모델 호출은 하지 않았다. 기존 9/4 브라우저 QA는 아래 날짜 기준 이력이다.

### 9/8 로컬 브라우저 오류 QA

- `127.0.0.1:5175/?feature=ai-pricing` 공통 프리뷰에서 가상 제목·설명·웹 개발을 입력하고 분석 요청.
- 기본 token provider가 null이므로 HTTP 전 `AUTH_REQUIRED` 발생. 실제 hook이 error로 전환되고
  오류 제목에 포커스가 이동하며 입력 3개가 보존됨을 확인했다.
- 1,500,000원 샘플 보고서·`pra_preview_1`·추천 채택 버튼이 노출되지 않았다. 재시도도 같은 오류를
  유지하고, 입력 다시 확인하기로 제목 입력에 복귀했다. 실제 외부 요청/계정 변경은 없다.
- 브라우저에서 503/네트워크·실제 승인 후 적용 실패를 주입한 것은 아니다. 해당 조합은 자동 회귀와
  아래 팀장 통합 QA로 구분한다.

### 통합 현황과 후속 QA

- 앱 분석 route·화면과 등록 왕복은 이미 통합됐고, 9/7 분석 ID handoff 보완도 `develop`에 있다.
  `feedback_loop/2026-09-07/ai-pricing.md`와 앱 등록 회귀 테스트 파일로 확인했다. 이 사실 확인은
  현재 운영 배포·외부 호출 성공을 확인한 것이 아니다.
- PRD D-91~93·ERD E-32~37에 CR 6건의 채택이 기록돼 있다. 아래 9/4의 "승인 필요" 문구는
  요청 당시 이력이며, CR-AP-002/003 상태 변경은 회의에서 팀장에게 배정돼 이번에 하지 않았다.
- 팀장 앱 QA 시: 첫 분석 401/503/네트워크 실패 → 오류 안내·입력 보존·샘플 보고서/채택 CTA 없음;
  승인 결과 → 실제 ID/금액 채택; 적용 실패 → 기존 실제 보고서 보존; PENDING → 제한 재조회;
  등록 복귀 → 새로고침 후 ID 유지, 수동 금액 변경 뒤 ID 해제 순서로 확인한다.
- 실제 DB transaction·운영 rate-limit/모델 검증, project-management CR-0012, 상세 화면 AI 진입
  링크는 해당 담당자·팀장 후속이다. `app/`·DB·다른 feature·피드백 상태는 변경하지 않았다.

### UX 자체 점검 변경분

상태 이해·근거 이해·비파괴성: 실제 실패를 샘플 성공 보고서로 표시하지 않으며 가짜 ID의 추천 채택을
제거했다. 작업 보호·복구 가능성: 보존된 실제 결과는 바꾸지 않는다. 선택권·접근 가능성: 기존 오류
복구 행동·포커스·레이아웃은 유지하며 별도 재설계를 하지 않았다.

## 2026-09-04 검증 기록 (통합 전 이력)

테스트 날짜: 2026-09-04

테스트한 커밋: 커밋 전

## 자동 검증

- [x] `npx tsx features/ai-pricing/prototype/run.tsx` — 27 PASS / 0 FAIL
- [x] prototype 진입점 strict TypeScript 검사 — PASS
- [x] `npm run preview:build` — PASS, 75 modules
- [ ] `npm run check:design` — 저장소 전체 기준 FAIL. ai-pricing 신규 누락 class는 0개지만 기존
  `applications`, `contracts-payments`, `reviews` 시안의 공유 `.success` 1건이 원인이다. 기능별 token
  파일 차이는 참고 경고로 함께 출력된다.

## 브라우저 QA

- [x] 실제 React 프리뷰의 기본 폼이 420px 호스트 컨테이너 안에서도 가로 붕괴 없이 표시됨
- [x] 빈 제출 시 폼 상단 오류 요약과 세 필드 링크가 표시되고 포커스가 오류 요약으로 이동함
- [x] 오류 요약의 제목 링크를 누르면 해당 입력 필드로 포커스가 이동함

## spec.md 규칙별 확인

| 규칙 | 확인 근거 | 결과 |
|---|---|---|
| 1. CLIENT·소유권 | S2-R2 생성 역할, S2-R9 조회 소유자, S2-R13 적용 소유자 | 통과 |
| 2. 정규화 snapshot | S2-R2 길이/unknown field·malformed JSON 400 parser, S2-R3 trim·공개 DTO, S2-R9 복제 조회 | 통과 |
| 3. POST 멱등 | S2-R4 생성 동시 replay, S2-R5 fingerprint 충돌·다른 사용자 동일 키 독립 생성, S2-R6 저장 input 버전 기반 fingerprint binding, S2-R12·R13 apply replay/충돌, create/apply/result 스키마 버전 분리 | 통과 (Mock·정적) |
| 4. terminal 재활성화 금지 | S2-R7 저장된 REJECTED 최초 body·502/504 exact replay와 새 키 재시도, S2-R18 모호한 실패 키 보존·확정 상태 새 키 행동 검사 | 통과 (Mock) |
| 5. 분석기 격리·비밀 비노출 | S2-R3·R6 허용 키 DTO, S2-R8·R11 repository가 던진 feature-shaped 오류까지 안전한 500, S2-R16·R20 서버 격리 | 통과 |
| 6. 설정 누락 fail-closed | S2-R10 신규 503·행 없음·저장 terminal replay, S2-R16 base-model allowlist·fine-tuned 거부 | 통과 |
| 7. 불신 결과 재검증 | S2-R6 정수·합계·항목/문자열 상한·추가 키, 손상 저장 row와 유효 형식 snapshot/fingerprint 불일치 거부, S2-R8 invalid result | 통과 |
| 8. PENDING terminal 전이 | S2-R3·R4·R7·R8·R9 생성 전 예약, 상태별 저장 불변식, 202, APPROVED/REJECTED, 완료 시각 | 통과 (Mock) |
| 9. 등록 handoff | S1-R1~R3 transaction claim 보존, S2-R19 등록 CTA·분석 ID callback 계약 | 부분 통과 — app 등록 연결 대기 |
| 10. 기존 프로젝트 원자 apply | S2-R12 strict 저장 APPROVED의 추천 금액 적용, S2-R14 malformed·식별자 불일치 포트 성공값 거부, S2-R15 lock/version/budget CAS, S2-R17 추천 금액 미전송 | 통과 (Mock) |
| 11. 원자 capability fail-closed | S2-R14 포트 부재 503·양쪽 무변경·알 수 없는 포트 오류, 임의 `PricingAnalysisApiError`, malformed 성공값의 안전한 500 | 통과 (Mock) |
| 12. apply exact replay·경합 | S2-R12 최초 body replay, S2-R13 다른 fingerprint, S2-R15 경쟁 loser 409·부분 갱신 없음 | 통과 (Mock) |
| 13. 크기·비용 제한 | S2-R6 결과 경계, S2-R16 token·256KiB body 상한·HTTP 200 미완료/실패/대기/취소·refusal·malformed envelope 거부, S2-R21 fingerprint 결합 멱등 rate limit·tuple scope 충돌 방지·429·malformed decision/capability 503 | 통과 (Mock) |

S2-R11은 정의되지 않은 repository 예약·CAS 결과와 ID가 다른 terminal 재조회를 안전한 500으로
닫는지 확인한다. S2-R17은 생성·조회·적용별 허용 HTTP 상태, 추가 키 없는 정확 DTO, 요청 분석·
프로젝트 ID binding을 검증하고 임의의 2xx·malformed 성공 body를 클라이언트 성공으로 처리하지
않는지 확인한다. S2-R18은 공용 `pollPendingAnalysis` 오케스트레이터가 같은 분석 ID만 GET하고,
400→800ms 뒤 terminal로 전이하며, deadline에서는 4회로 제한하고 새 POST를 만들지 않으며 진행 중인
GET을 abort하는지 Mock으로 확인한다. 같은 R18에서 공용 순수 함수
`shouldRotatePricingAnalysisCreateKey`·`selectPricingAnalysisRetryKey`가 모호한 500에는 기존 키를
보존하고, `IDEMPOTENCY_KEY_REUSED`·REJECTED 오류 snapshot·수동 GET의 REJECTED에는 새 키를
선택하는지도 행동으로 검증한다. 전체 runner 테스트 묶음 수는 계속 27개다.

## UX 철학 7항목

| 항목 | 확인 결과 |
|---|---|
| 상태 이해 | idle·loading·submitting·ready·rejected·error·conflict·applying·applied를 문장과 상태별 패널로 구분한다. PENDING deadline 뒤에는 계속 처리 중임을 숨기지 않는다. |
| 근거 이해 | 추천 총액, 항목별 설명·금액·산정 이유, 입력 snapshot, 완료 시각, 통화, 분석 기준과 한계를 함께 보여준다. 근거 없는 범위·유사 프로젝트 수치는 만들지 않는다. |
| 작업 보호 | 입력은 페이지가 열려 있는 동안 React 상태로 보존한다. 인증정보가 남을 수 있는 영구 저장소나 `sessionStorage`에는 쓰지 않는다. 응답 유실 재시도는 마지막 멱등 키를 재사용한다. |
| 복구 가능성 | 확정 REJECTED는 새 요청 재시도, 모호한 실패는 exact replay, PENDING은 제한 조회 후 수동 상태 확인, apply 실패는 보고서를 유지한 채 최신 프로젝트 확인·동일 요청 재시도를 제공한다. |
| 선택권 | 등록에서는 `이 추천 예산 사용하기`와 `직접 예산 입력하기`, 기존 프로젝트의 적용 전 상태에서는 `프로젝트 예산에 반영`과 `반영하지 않기`를 동등하게 제공한다. 적용 완료 뒤에는 이 사전 action과 문구를 제거하고 완료 후 이동만 제공한다. |
| 비파괴성 | 분석만으로 예산을 바꾸지 않는다. 적용 전 현재·권장·변경 금액을 보여주며 lock/version/current-budget CAS와 원자 포트가 모두 통과할 때만 변경한다. 완료 상태는 변경 전·후 금액과 적용 시각만 확정 정보로 표시한다. |
| 접근성 | `aria-live`, `role=status|alert`, label·설명 연결, 입력 실패 시 링크가 있는 폼 상단 오류 요약 포커스, 상태 전환 제목 포커스, 키보드 focus-visible, reduced-motion, 모바일 가로 overflow 검사를 반영했다. |

## 아직 안 되는 것

- 실제 DB migration과 unique/CAS/transaction 구현은 없다. 인메모리 Mock은 계약 검증용이다.
- REJECTED 최초 오류 body·HTTP 상태의 DB 영속화는 `CR-AP-004` 승인과 migration이 필요하다.
- 생성 멱등 키의 요청자별 unique 범위는 `CR-AP-005` 승인과 migration이 필요하다.
- 저장 create fingerprint를 검증할 입력 스키마 버전 컬럼과 기존 행 원자 backfill은 `CR-AP-006`
  승인과 migration이 필요하다.
- `app/server` Express route와 저장소, `app/web` 공용 HTTP/auth 및 프로젝트 등록 화면 연결은 없다.
- 분산 rate-limit 저장소·시간 창·운영 quota는 확정되지 않았다.
- 강제 종료 뒤 stale PENDING 회수 정책과 예산 ABA를 막는 `budgetRevision`은 미정이다.
- 운영 모델/키/timeout이 미정이다. 현재 strict schema 제약을 지원한다고 검증한 base model의 명시적
  allowlist가 필요하며, allowlist 밖 모델과 `ft:` fine-tuned model은 거부한다.
- 실제 OpenAI, 실제 DB, 실제 인증 토큰을 사용한 통합/E2E는 실행하지 않았다.

## 팀장 통합 시 결정할 것

- CR-AP-001 결과 컬럼 nullability와 상태 CHECK
- CR-AP-002 카테고리 코드 단일 정본과 migration
- CR-AP-003 적용 멱등 결과 저장 위치와 교차 도메인 원자 adapter
- CR-AP-004 분석 실패 공개 응답 스냅샷의 저장 위치와 상태별 CHECK
- CR-AP-005 생성 멱등 키의 요청자별 unique index 또는 공통 멱등 저장소
- CR-AP-006 `input_fingerprint_schema_version varchar(20)`과 기존 fingerprint 원자 backfill
- 분산 rate-limit 정책, stale PENDING 운영 작업, 예산 revision 정책
- `OPENAI_API_KEY`·모델·deadline 및 app route 활성화 시점
