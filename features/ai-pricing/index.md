# ai-pricing Index

담당자: 오민혁

기준일: 2026-09-04

## 현재 상태

- Step 1 내부 포트를 호환성 그대로 보존했다.
  - 신규 프로젝트: `claimPricingAnalysisForCreatedProject(transaction, input)`
  - 기존 프로젝트 추천 조회: `getPricingAnalysisRecommendation(query)`
- Step 2 동기식 MVP의 기능 계약, 공개 API 계약, 프레임워크 비종속 서버·웹 프로토타입,
  OpenAI Responses adapter와 high-fi 화면을 구현했다.
- 분석 생성은 멱등 예약, 사용자별 호출 제한, strict structured output, 애플리케이션 재검증,
  `PENDING → APPROVED|REJECTED` 저장을 포함한다.
- OpenAI HTTP 200도 완료된 Responses envelope와 단일 완료 assistant `output_text`만 허용한다.
  refusal·미완료/실패/대기/취소 상태·malformed/256KiB 초과 body는 무효 결과로 거부한다.
- 요청 JSON은 전용 parser에서 400 `MALFORMED_JSON`으로 구분한다. 저장 행 상태 불변식과
  rate-limit·repository·project apply 포트 결과나 예외가 계약과 다르면 임의 오류 모양도 신뢰하지
  않고 503/500으로 fail-closed한다.
- create 입력 fingerprint, apply 입력 fingerprint, 분석 결과는 각각 독립된 스키마 버전을 사용한다.
  create 멱등 범위는 요청자별이며, 생성 replay는 `PENDING` 202, `APPROVED` 200, `REJECTED` 최초
  502/504 오류 사본을 현재 mapping으로 재계산하지 않고 보존한다.
- create 입력 버전은 분석 행에 함께 저장하며, 저장 `requesterId`·`inputSnapshot`·해당 버전으로
  fingerprint를 재계산해 일치한 행만 replay·조회·apply에 사용한다.
- 기존 프로젝트 적용은 `expectedBudgetAmount` CAS와 원자 포트가 있을 때만 허용한다. 등록 중 채택은
  `/apply`가 아니라 기존 `POST /api/v1/projects`의 `pricingAnalysisId`로 전달한다.
- 자동 검증은 Step 1 회귀를 포함해 27 PASS / 0 FAIL이며 strict TypeScript와 preview build도
  통과했다. 실제 app/DB 배포 연결은 아직 하지 않았다.

## Step 2 공개 API

| 용도 | API | 현재 상태 |
|---|---|---|
| 분석 생성 | `POST /api/v1/pricing-analyses` | 서비스·controller·OpenAI/Mock adapter 구현 |
| 내 분석 조회 | `GET /api/v1/pricing-analyses/:pricingAnalysisId` | 소유권·안전 DTO·PENDING 복구 구현 |
| 기존 프로젝트 적용 | `POST /api/v1/pricing-analyses/:pricingAnalysisId/apply` | 원자 포트 계약·Mock 구현, 실제 DB adapter 대기 |

웹 프로토타입은 Bearer token provider를 주입받으며, PENDING을 400→800→1600ms backoff와 5초
deadline으로 조회한다. 각 GET 자체도 남은 deadline으로 취소한다. 응답 유실·모호한 5xx 재시도는
마지막 생성 키를 보존하고, 확정된 REJECTED 또는 키 충돌 뒤에만 새 키를 발급한다.
성공 응답은 endpoint별 HTTP 상태, 추가 키 없는 정확 DTO와 요청 분석·프로젝트 ID가 모두 일치할
때만 수용하며, 임의의 2xx나 malformed body는 화면 성공 상태로 전환하지 않는다.
입력 오류는 폼 상단 요약으로 포커스를 옮기고 각 오류에서 해당 필드로 이동할 수 있다. 기존 프로젝트
적용 완료 뒤에는 적용 전 문구·action을 숨기고 변경 전·후 금액과 완료 시각·완료 후 이동만 보여준다.

## 문서와 산출물

- `spec.md` — 상태, 검증, 소유권, 멱등성, Step 1/2 업무 규칙 정본
- `api-contract.md` — DTO, 상태별 응답, 오류 코드, 등록 handoff
- `prototype/` — 실행 가능한 서버·웹·OpenAI/Mock 경계와 통합 runner
- `design/high-fi.html` — 등록/기존 프로젝트와 정상·대기·실패·충돌·적용 상태 시안
- `test-report.md` — 자동 검증과 UX 철학 확인 결과
- `change-requests/` — 도메인 정본·런타임·원자성 충돌의 승인 요청

## 배포 블로커

1. `pricing_analyses`가 PENDING/REJECTED를 저장하도록 결과 컬럼 nullability와 상태 CHECK를 확정해야
   한다 (`CR-AP-001`).
2. PRD/ERD와 현재 project-management 런타임의 카테고리 코드를 하나로 맞춰야 한다
   (`CR-AP-002`).
3. 실제 DB에서 프로젝트 예산, 분석 claim, 적용 멱등 결과를 한 transaction으로 처리하는
   `ProjectBudgetApplicationPort` adapter가 필요하다 (`CR-AP-003`).
4. REJECTED 최초 공개 오류와 HTTP 상태를 재시작·배포 간 exact replay할 영속 저장소와 migration이
   필요하다 (`CR-AP-004`).
5. 생성 멱등 키의 global unique를 요청자별 복합 unique로 바꾸거나 공통 멱등 저장소를 채택해야 한다
   (`CR-AP-005`).
6. create fingerprint의 입력 스키마 버전을 보존할 `input_fingerprint_schema_version varchar(20)`과
   기존 행 fingerprint 원자 backfill migration이 필요하다 (`CR-AP-006`).
7. `app/server` route·저장소 migration과 `app/web`의 공용 HTTP/auth·등록 흐름을 연결해야 한다.
8. 여러 서버 인스턴스가 공유하는 사용자별 rate-limit 저장소와 운영 한도·시간 창을 정해야 한다.
9. 운영 `OPENAI_API_KEY`, timeout과 현재 JSON Schema 제약을 지원하는 base model의 명시적
   allowlist를 정해야 한다. allowlist 밖 모델과 `ft:` fine-tuned model은 운영 adapter가 거부한다.
10. 프로세스 강제 종료로 남은 stale PENDING의 탐지·회수 정책과 예산 ABA를 막을 장기
   `budgetRevision` 정책을 확정해야 한다.

위 블로커가 해소되기 전에는 운영 route를 활성화하지 않는다. 특히 원자 적용 또는 rate-limit
capability가 없으면 프로토타입 계약대로 행·예산을 바꾸지 않고 503으로 닫는다.

## 로컬 검증

```bash
npx tsx features/ai-pricing/prototype/run.tsx
npx tsc --noEmit --strict --esModuleInterop --jsx react-jsx --lib ES2022,DOM --moduleResolution bundler --module ESNext --target ES2022 features/ai-pricing/prototype/run.tsx
npm run preview:build
```

현재 결과: runner 27 PASS / 0 FAIL, strict TypeScript PASS, preview build PASS.
