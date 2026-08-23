# ADR-0009: 외부 벤더 연동 — 인터페이스 레이어 필수화

| 항목 | 내용 |
|---|---|
| 상태 | 확정 |
| 작성 | 팀장 + AI 협업자 |
| 날짜 | 2026-08-24 |
| 관련 결정 | ADR-0008 인증 방식, `sdd-framework/constitution.md` 원칙 10 |

---

## 1. 배경 (Context)

ADR-0008에서 인증 방식으로 Supabase Auth를 채택하면서, 벤더 종속(추후 다른 인증 체계로 이전할
경우 비용이 발생함)을 남은 리스크로 명시했다. 같은 성격의 벤더 의존이 결제(토스페이먼츠)·AI
단가분석(OpenAI)에도 있다 — 세 곳 모두 향후 요금제 변경, 서비스 정책 변경, 더 나은 대안 등장
시 교체 가능성이 있는 외부 벤더다.

## 2. 문제 정의 (Problem)

컨트롤러·서비스 코드가 벤더 SDK(예: `@supabase/supabase-js`, 토스페이먼츠 SDK, `openai`
패키지)를 직접 import해서 쓰면, 나중에 벤더를 바꿀 때 그 SDK를 호출하는 모든 자리를 찾아
고쳐야 한다. 8개 기능에 흩어져 있으면 영향 범위를 전부 찾기도 어렵다. 처음 설계할 때 이 결정을
내려두지 않으면, 나중에 되돌리는 비용(모든 호출부를 찾아 리팩터링)이 크다.

## 3. 검토한 대안 (Options)

### 대안 A — 벤더 SDK 직접 호출

장점: 초기 구현이 가장 빠르고 코드가 단순하다.
단점: 벤더를 바꾸면 호출부 전체를 찾아 고쳐야 한다. `prototype/run.tsx`의 Mock 테스트도 실제
SDK를 흉내 내야 해서 테스트 자체가 벤더에 의존하게 된다.

### 대안 B — 인터페이스(포트) + 어댑터로 추상화 (채택)

장점: 비즈니스 로직은 인터페이스만 알고, 벤더별 구현(어댑터)은 별도 파일로 분리된다. 벤더
교체는 새 어댑터 파일 하나 추가 + 연결부(composition root) 한 줄 교체로 끝난다 —
`sdd-framework/constitution.md` 원칙 9(확장은 파일 1개)와 정합한다. `run.tsx` Mock도 인터페이스를
구현한 가짜 어댑터로 만들면 되므로 실제 벤더 없이도 테스트할 수 있다.
단점: 파일이 하나 더 생기고(인터페이스+어댑터), 처음 설계할 때 약간의 추가 사고가 필요하다.

## 4. 결정 (Decision)

대안 B(인터페이스+어댑터)를 채택한다. 아래 세 벤더 접점에 적용한다.

| 접점 | 인터페이스(포트) 예시 | 벤더 어댑터 예시 |
|---|---|---|
| 인증 (Supabase Auth) | `auth.port.ts` — `AuthProvider` | `supabase-auth.adapter.ts` |
| 결제 (토스페이먼츠) | `payment.port.ts` — `PaymentGateway` | `toss-payments.adapter.ts` |
| AI 단가분석 (OpenAI) | `pricing-analyzer.port.ts` — `PricingAnalyzer` | `openai.adapter.ts` |

컨트롤러·서비스는 인터페이스 타입만 참조하고, 구체 어댑터는 앱 진입부(`app/server/src/app.ts`
등 조립 지점) 한 곳에서만 연결한다. 이후 새로 추가되는 외부 벤더 연동(예: 이메일 발송, 파일
스토리지)에도 같은 패턴을 기본으로 적용한다 (`sdd-framework/constitution.md` 원칙 10).

## 5. 남은 리스크 (Risk — 미해결)

- 인터페이스 설계가 특정 벤더의 기능에 맞춰 너무 좁게 잡히면("과적합"), 실제 벤더 교체 시에도
  인터페이스 자체를 다시 설계해야 할 수 있다. 인터페이스는 벤더 용어가 아니라 도메인 용어로
  정의해야 한다 — 예: Supabase의 `signInWithOAuth(provider)`를 그대로 베끼지 말고, 도메인
  관점에서 "OAuth로 로그인하면 `AuthSession`을 반환한다"는 수준으로 추상화한다.
- 이 패턴을 처음 적용하는 담당자에게는 추가 학습 비용이 있다 — `features/sample-login/`을
  Supabase Auth 방식으로 다시 쓸 때 실제 예시로 만든다 (아직 미반영).

## 6. 영향받는 문서/구조 — 구현 기록 (참고용, 결정 내용 아님)

> 아래는 이 결정이 실제로 어떻게 실행됐는지에 대한 기록이다. §4~§5의 결정 내용을 바꾸는
> 것이 아니다.

- `sdd-framework/constitution.md` 원칙 10으로 추가.
- `docs/naming-convention.md` §6에 포트/어댑터 파일명 규칙 추가.
- `sdd-framework/feature-workflow.md` DoD에 체크 항목 추가.
- `app/server/AGENTS.md`에 세 벤더 접점 구조 예시 추가.
