# notifications 테스트 결과

## 2026-09-10 실제 배포 통합 QA — 일부 통과, 양성 데이터·수신 검증 차단

대상: `https://pact-five-seven.vercel.app/`. 코드 대조 기준은 최신 develop `38ab13c`이며,
배포의 정확한 commit SHA는 확인하지 않았다. 아래 HTTP 값은 동일 배포에 별도로 보낸 API
요청의 실제 상태/본문이다. 브라우저가 보낸 요청을 네트워크 패널에서 캡처한 값은 아니다.
비밀번호·토큰·쿠키는 기록하지 않는다. 원천 지원/수락/거절/마감 상태나 DB는 변경하지 않았다.

### 실제 API 결과

사용자가 제공한 seed 계정 10개 모두 로그인 200, 목록 200, 미읽음 수 200이었다.
각 계정의 목록 응답은 `{"items":[],"unreadCount":0,"limit":100}`, 개수 응답은
`{"unreadCount":0}`이며 목록의 `Cache-Control`은 `no-store`였다.

| 확인 계정 별칭 | 목록 수 / 미읽음 |
|---|---|
| client-fresh / freelancer-fresh | 각각 0 / 0 |
| client-recruiting / freelancer-applicant | 각각 0 / 0 |
| freelancer-auto-rejected / client-closed | 각각 0 / 0 |
| client-contract-pending / freelancer-contract-pending | 각각 0 / 0 |
| client-payment-ready / freelancer-payment-ready | 각각 0 / 0 |

계정은 `seed.<역할>.<상태>@pactfive-dev-seed.com`에 대응한다. 아래 인증 요청은 client-fresh다.

| 요청 | 실제 HTTP | 실제 응답 |
|---|---|---|
| POST `/api/v1/notifications/read-all`, `{}` | 200 | `{"updatedCount":0,"unreadCount":0}` |
| 같은 전체 읽음 반복 | 200 | `{"updatedCount":0,"unreadCount":0}` |
| POST `/api/v1/notifications/ntf_qa_missing_20260910/read`, `{}` | 404 | `{"error":{"code":"NOTIFICATION_NOT_FOUND","message":"알림을 찾을 수 없습니다."}}` |
| GET 목록에 다른 제공 계정의 `recipientId` query 추가 | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"요청 값이 올바르지 않습니다."}}` |
| 비인증 GET 목록 / GET unread-count / POST read-all | 각각 401 | `{"error":{"code":"UNAUTHORIZED","message":"로그인이 필요합니다."}}` |

빈 계정 10개가 각각 200인 사실은 **타인 알림 접근 차단의 양성 데이터 검증이 아니다**.
존재하는 타인 알림 ID에 대한 404, 본인 알림 1건 읽기, 여러 건 전체 읽음은 실행하지 못했다.

### 실제 브라우저 결과

1. freelancer-fresh 복원 후 `/notifications`: 헤더와 페이지 벨 모두
   **“알림, 안 읽은 알림 0개”**, 요약 **“0 개”**, **“아직 도착한 알림이 없어요”**,
   **“프로젝트의 새로운 소식이 생기면 이곳에 알려드릴게요.”**. **“모두 읽음”** 비활성.
2. 안 읽음 필터: **“최근 100건에 안 읽은 알림이 없어요”**,
   **“전체 목록에서 지난 알림을 다시 확인할 수 있어요.”**, **“전체 알림 보기”**.
3. 새로고침: **“새로고침 중…”** 이후 **“알림 목록을 새로고침했습니다.”**. 0건 유지.
4. 로그아웃 후 직접 진입: **“— 개”**, **“다시 로그인해 주세요”**,
   **“로그인 상태를 확인할 수 없어 알림을 숨겼습니다.”**. 새로고침/모두 읽음 비활성.
5. `/login?returnTo=%2Fnotifications`에서 client-fresh 로그인 후 **`/`로 이동**하고
   헤더에 **“로그인”**이 남았다. 요청한 알림 화면 자동 복귀는 실패했다. 직접
   `/notifications`로 전체 문서 이동한 뒤 세션이 복원되면 다시 벨/요약 0과 빈 안내를 표시했다.
   로그인 후 상태 공유와 returnTo 전달 경로는 팀장 app 후속이며 이번 QA에서 수정하지 않았다.

두 계정의 빈 목록/로그아웃 숨김은 확인했으나, 이전 계정의 실제 알림이 제거되는지는 미검증이다.
세션 bootstrap 중 잠깐 로그인 요구 화면이 보이는 현상도 관찰했다. 화면의 상태 코드를 추정하지 않는다.
검증 후 생성한 API 세션 10개는 각각 DELETE current 204로 종료했고, 브라우저도 로그아웃했다.

### 로컬 회귀와 통합 결함 대조

- `npx tsx features/notifications/prototype/run.tsx`: **87 PASS / 0 FAIL**.
  Mock·loopback HTTP·SSR/store 검증으로 운영 알림 수신 성공을 뜻하지 않는다.
- `npx tsc -p features/notifications/prototype/tsconfig.json`: strict PASS.
- 별도 메모리 전달 비교: 같은 APPLICATION_SUBMITTED 입력에서 프로젝트 ID `prj_qa_short`
  (12자)는 `{"status":"delivered","createdCount":1,"duplicateCount":0}`, 저장 1건.
  배포 목록에서 관찰한 36자 프로젝트 ID는 `{"status":"retry_required"}`, 저장 0건.
  배포 DB에 사건을 생성한 것이 아니라 원본 delivery port에서 ID 계약 충돌을 재현했다.
- `app/server/src/express-app.ts`는 원천 applications에 InMemoryApplicationNotificationPort를
  주입하며 notifications.delivery를 사용하지 않는다. seed도 알림 행을 만들지 않는다.
- app 헤더와 NotificationListPage가 각자 useNotifications/store를 생성한다. 계약의 한 snapshot
  공유와 다르며, 읽음 뒤 헤더 stale 위험이다. 0건인 배포에서 양성 재현했다고 주장하지 않는다.
- DB Notification 식별자는 varchar(40)으로 늘었으나 서비스/웹의 ID·링크 검증은 최대 30자다.
  원천 사건 연결 전에 이 불일치를 함께 조정해야 한다. 상세 근거·담당은 CR-0001의 9/10 절.

### 판정과 재개 조건

| 사용자 요청 | 판정 | 남은 실제 증거 |
|---|---|---|
| 알림 목록·미읽음 배지 | PARTIAL | 빈 상태 0만 확인. 실제 행과 양수 배지 및 동시 갱신 필요 |
| 개별·전체 읽음 | PARTIAL | 전체 읽음 0건 반복/없는 ID 404만 확인. 본인 1건·여러 건 읽음 필요 |
| 계정별 분리 | PARTIAL | 10계정 조회/비인증 차단/로그아웃 숨김 확인. 실제 타인 행 접근 404 필요 |
| 지원·수락·거절·마감 알림 수신 | BLOCKED | producer 연결 + ID 계약 정합성 + 승인된 양성 시나리오 데이터 필요 |

팀장/원천 담당자가 연결과 QA 전용 사건·수신자를 준비한 뒤, 사건별 발생 시각·eventId·수신자·
알림 ID·HTTP·화면 문구를 묶어 재검증한다. 직접 거절과 다른 지원자 수락에 따른 자동 거절,
자연 마감은 구분한다. 재전달 중복 방지·재시작·마감 10분 SLA는 여전히 미검증이다.
아래 9/8 체크리스트의 “아직 실행하지 않음”은 당시 이력이며 현재 부분 실행 결과는 이 절이 정본이다.

## 2026-09-08 통합 준비 검증

기준: `origin/develop ec1c01f`를 `feature/notifications`에 동기화한 뒤 담당 폴더만 변경.
기존 PR #75의 develop 병합과 운영 app 연결은 별개의 상태다.

| 검증 | 결과 | 실제 범위 |
|---|---|---|
| `npx tsx features/notifications/prototype/run.tsx` | **87 PASS / 0 FAIL** | 기존67 + 조립/loopback HTTP6 + 공용 request 주입14 |
| `npx tsc -p features/notifications/prototype/tsconfig.json` | PASS | 담당 구현·테스트 strict typecheck |
| `npm run preview:build` | PASS | 공용 Vite preview, 102 modules |
| `npm run test:integration` | **28 PASS / 0 FAIL** | 기존 이메일 인증 bootstrap·AI 분석 ID 등록 왕복 회귀, 테스트 전용 데이터 |
| `npm run check:design` | FAIL, 기존 상태 재확인 | applications/contracts-payments/reviews의 `.success`가 공유 tokens.css에 없음; 해당 파일 미수정 |

### 추가 규칙과 연동 범위

| 규칙 | 검증 | 결과 |
|---|---|---|
| 19 | 필수 인증 resolver, 한 저장소의 전달 port→Express→API4→실제 NotificationHttpApi, 구조분해 호출 | 통과 |
| 20 | 외부 공용 오류 클래스의 401을 조회/개별/전체 읽음에서 정규화, 목록·배지 제거 | 통과 |
| 20 | 400/404/5xx/네트워크 오류 안전 문구, 확인 데이터 보존, 잘못된 DTO 거부, 정확한 경로 | 통과 |
| 4·20 | 전체 읽음 응답은 `unreadCount: 0`만 성공; 양수 응답에 목록·배지 보존/후속 GET 없음; 성공 뒤 새 알림은 표시 | 통과; 추가 테스트로 수정 전 85 PASS / 2 FAIL 재현, 수정 후 87 PASS / 0 FAIL |
| 1–4 | 동일 HTTP 경로에서 본인 격리·타인404·반복 읽음·전체 읽음·인증 전 malformed JSON·비공개 생성 | 통과 |
| 5–14 | 정규화한 필수6종 생성→재전달→본인 목록/개수, 필드 부족한 축약 이벤트 거부 | 통과 |
| 13·18 | 부분 저장 실패 retry_required→같은 closure 재전달 delivered·중복 없음 | 통과; 실제 원천 operation ACK/영속 worker/10분 SLA는 미검증 |
| 15–17 | 기존 SSR·필수 요소·스타일·store 회귀67 중 관련 항목 | 통과; 화면 표현은 유지하고 아래 로컬 브라우저 QA 재실행 |

서버 연동은 `notification-integration.test.ts`에서 **127.0.0.1 임시 포트**와 테스트 전용 인증
resolver·in-memory repository를 사용한다. 실제 Supabase 계정·운영 DB·프로젝트 상태 변경·
외부 알림 발송은 없다. 공용 request 검증은 `notification-transport.test.ts`의 주입 함수/
별도 오류 클래스로 수행하며 app의 `shared/http.ts` 자체를 실행한 것은 아니다. 전역 header와
페이지가 같은 snapshot을 실제 React 앱에서 소비하는지는 아래 통합 후 QA로 확인한다.

### 9/8 로컬 브라우저 QA (실행 완료)

대상은 Vite `127.0.0.1:5174`의 담당 feature 독립 React preview다. 실제 계정·DB는 연결하지 않았다.

- 개별 읽음 3→2, 읽음 기록 유지·프로젝트 링크로 포커스 이동 확인.
- Enter로 안 읽음 필터 → 2건, 모두 읽음 → 0/빈 안내, 전체 복귀 → 원본 기록 3건 유지.
- 프리랜서로 전환 → 5종/미읽음4, 이전 의뢰인 목록 없음. 세션 만료 → 목록 숨김·로그인 복귀 링크.
- 빈 목록 → 0/빈 안내, 로딩 → 읽음 동작 비활성, 실패 → 안전 문구·재시도 확인.
  재시도 중 로딩 후 지속 실패하고 새로고침 버튼으로 포커스 복원.
- 320px: document scrollWidth305≤viewport320, 표시된 button/link/select 중 높이44px 미만0개.
  1280px: scrollWidth1265≤viewport1280. 임시 viewport는 검증 후 원복했다.
- 브라우저 warning/error 로그0건. DOM·화면 확인이며 실제 OS 스크린리더/200% 확대/운영 앱 E2E는 미실행.
- 잘못된 read-all 응답과 후속 도착 알림의 경쟁 상황은 위 자동 테스트로 검증했다. 브라우저 Mock
  시연은 정상 응답 흐름이므로 잘못된 응답의 브라우저 주입 재현이라고 표시하지 않는다.

### 팀장 통합 후 QA 체크리스트 (아직 실행하지 않음)

1. DB·ID: 실제 생성 사용자/프로젝트 ID가 varchar(30) 및 알림 입력/링크 계약에 맞는지 확인.
   현재 기본 사용자와 프로젝트 생성자는 모두36자이므로 정책 결정 전 운영 성공으로 표시하지 않음.
2. API4: 활성 의뢰인·프리랜서로 목록/개수/개별/전체 읽음. 타인/없는ID404, 비로그인401,
   malformed JSON 인증 전401/인증 후400, 공개 생성404, Cache-Control no-store 확인.
3. UI: `/notifications` 직접 진입/새로고침/로그인 복귀. AppShell과 별도 HomeHeader 배지가
   목록과 같은 snapshot을 써서 개별/전체 읽음 즉시 반영. 100건 밖 미읽음도 총수에 포함.
4. 세션: bootstrap 완료 전 요청 없음, 로그아웃/다른 계정/같은 계정 재로그인 시 이전 목록 숨김.
   공용 HTTP401 뒤 세션 처리, 늦은 응답 무시, refresh token 갱신 중 불필요한 store 초기화 없음.
5. 통신: 기존 `/api` base에 `/v1/notifications` 경로 연결, 배포 CORS·쿠키·Bearer 유지.
   공용 HTTP는 2xx status를 숨기므로 201/202를 정확한200과 구분하는 계약 검증은 추가로 필요.
6. 원천 사건: 실제 지원→수락→자동미선정/직접미선정, 마감과 취소 별도 문구·수신자 확인.
   같은 eventId/closureEventId 재전달은 한 건, 마감/취소를 AUTO_REJECTED로 중복 생성하지 않음.
7. 실패: DB 저장 실패/부분 저장/저장 후 ACK 유실 시 본 작업을 되돌리지 않고 알림 단계만
   재시도. 영속 사건·상태 변경 전 수신자 스냅샷 보존과 재시작·다중worker 중복 방지를 확인.
8. 마감: 아무도 조회하지 않아도 능동 worker가 실행됨. 알림 저장 성공 이후 deadlineNotifiedAt,
   이미 CLOSED여도 미전달 재시도, deadline→알림 저장 10분 이내 증거 확인.

현재 원천별 파일 근거/담당자/정책 미확정 항목은 CR-0001, 서버/웹 조립 예시는 API 계약을
정본으로 사용한다. 화면 재설계 프롬프트의 표현 변경은 이번 범위가 아니며 기존 design/은 유지.

## 2026-09-07 최초 구현 검증 기록

담당자: 오민혁 · 테스트 날짜: 2026-09-07
테스트한 커밋: develop b945f7c 기반 feature/notifications 구현 (커밋 전)

## 자동 검증

- [x] `npx tsx features/notifications/prototype/run.tsx`: **67 PASS / 0 FAIL**.
  서버 업무/HTTP 19 + 서버 경계 12 + 클라이언트/Mock/store 28 + SSR/스타일 8.
- [x] 기존 user-management 53 PASS / 0 FAIL, ai-pricing 27 PASS / 0 FAIL.
- [x] `npx tsc -p features/notifications/prototype/tsconfig.json`: PASS.
- [x] `npm run preview:build`: PASS (notifications 포함 공통 Vite 빌드).
- `npm run check:design`: **FAIL (기존 상태)**. applications/contracts-payments/reviews `.success`가
  app 공통 tokens.css에 없는 baseline 실패. notifications는 이 파일들을 변경하지 않는다.

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 | 서버: 활성 인증·타인/없는 ID 동일404·공개 recipient/query 주입 | 통과 |
| 2 | 서버: 105건 seed→100건 반환/미읽음105·동률 정렬·조회 비파괴·빈 목록 | 통과 |
| 3 | 서버: 첫 readAt 보존·반복 성공·미읽음 감소 | 통과 |
| 4 | 서버: 전체105건·타인/기존readAt 보존·나중 도착 건 unread | 통과 |
| 5 | APPLICATION_SUBMITTED 의뢰인 1명 | 통과 |
| 6 | APPLICATION_ACCEPTED 선정자 1명 | 통과 |
| 7 | APPLICATION_REJECTED 해당 지원자 1명 | 통과 |
| 8 | APPLICATION_AUTO_REJECTED 해당 미선정자 1명·별도 종류 | 통과 (원천 reason 연결 별도) |
| 9 | 마감 snapshot 중복 제거·closureEventId 필수·재전달 중복 없음 | 통과 (수신자 정책 CR 확인 필요) |
| 10 | 취소 PENDING+선정 합집합·null 선정자·빈 대상 | 통과 |
| 11 | 20개 동시 재전달·종류/수신자/모집 회차 분리·키 길이 | 통과 |
| 12 | 길이/식별자/시각·고정 내부경로·DTO 최소화·반환 사본 | 통과 |
| 13 | 부분 INSERT 실패→retry_required→동일 사건 재전달·중복 없음 | 통과 (안전 port; 실제 도메인 rollback/내구성 미검증) |
| 14 | enum13·선택7/별칭/REVIEW_CREATED 생성 거부 | 통과 |
| 15 | HTML 필수 요소 manifest9개·SSR·브라우저 필터·배지·관련 링크 | 통과 |
| 16 | store/API 계정 전환·401·늦은 응답·실패/재시도·중복 조작·브라우저 재시도 | 통과 |
| 17 | React escape·버튼/time/live·Enter 조작/포커스·320px·스타일 계약 | 통과 (실제200% 확대/스크린리더 별도) |
| 18 | 마감 안전 전달 성공/실패 ACK 신호 확인 | 부분 통과; 운영 scheduler/10분 SLA 미검증 |

## QA 테스트 플로우

실제 계정이나 거래가 아닌 preview의 가상 데이터만 사용한다.

1. 기본 의뢰인 상태: 지원 접수 알림·총 미읽음·최근100건 안내를 확인한다.
2. 한 항목 읽음: 미읽음 1 감소, 읽음 표시, 프로젝트 보기 유지. 반복/연속 클릭 중복 처리 없음.
3. 안 읽음 필터: 이미 읽은 항목 제외. 모두 읽음 후 빈 상태, 전체로 돌아오면 기록 유지.
4. 프리랜서 전환: 선정/직접미선정/자동미선정/마감/취소 구분. 이전 계정 알림 잔존 없음.
5. 빈 목록: 0개 및 다음 소식 안내. 세션 만료: 이전 내용 숨김 및 로그인 복귀 링크.
6. 실패 상태: 오류 원문/토큰 비노출, 재시도 버튼. 일반 갱신 오류에는 확인된 목록 보존.
7. 320px/데스크톱: 수평 넘침·잘린 주요 버튼 없음. Tab으로 필터/읽음/프로젝트 링크 이동,
   Enter/Space 조작, 읽음 처리 후 포커스 소실 없음. reduced-motion에서 이동 효과 제거.
8. 팀장 통합 후 실제 사용자(의뢰인1·프리랜서3)로 지원→수락→다른 지원 자동미선정,
   직접미선정, 마감, 취소→실제 DB/배지/읽음을 별도 E2E 검증한다.

### 이번 브라우저 QA 실행 결과

대상: Vite 127.0.0.1:5174의 feature 독립 React preview 및 공통 `/?feature=notifications`.

- 개별 읽음: 3→2, 읽음 표시·원본 기록 유지, 완료 후 프로젝트 링크로 focus 이동 확인.
- Enter로 안 읽음 필터 선택→2건, 모두 읽음→0/빈 안내, 전체 복귀→기록3건 유지 확인.
- 프리랜서 전환→5종/미읽음4, 세션 만료→목록 숨김·로그인 경로, 빈 계정→0/빈 안내 확인.
- 오류→재시도 중 로딩 안내→지속 오류, 완료 후 새로고침 버튼으로 focus 복원 확인.
- 1280px: 216px+896px 2열, document scrollWidth1265≤viewport1280.
- 320px: 1열273px, document scrollWidth305≤viewport320. 표시된 button/link/select 중 높이44px 미만0개.
- 공통 하네스420px: container query로 1열388px, feature scrollWidth420=container420 확인.
- 브라우저 warning/error 로그0건. 전체 시각 확인은 수행했으나 실제 OS 스크린리더·브라우저200%
  확대·외부 기기·운영 DB E2E는 이번에 실행하지 않았다. reduced-motion은 CSS 계약 자동 검사다.
- 새 preview entry를 Vite 기동 후 추가한 경우 glob 목록이 갱신되지 않아 Vite 재시작 후 발견되는 것 확인.

## ux-philosophy.md §6 자체 점검

| 검증 항목 | 이 화면에서 충족하는 방식/검증 한계 |
|---|---|
| 상태 이해 | 종류·미읽음/읽음·발생 시각·총 미읽음·100건 범위를 문구로 설명한다. |
| 근거 이해 | 서버 사건 문구와 절대 한국 시각·프로젝트 링크를 제공한다. 운영 원천 사건 연결은 미검증. |
| 작업 보호 | 읽음 기록 삭제 없음. 갱신 실패 시 확인된 목록을 보존하되 세션 만료에는 개인정보를 숨긴다. |
| 복구 가능성 | 로딩/빈 목록/연결 오류/로그인 필요를 분리하고 재시도·로그인 복귀 제공. |
| 선택권 | 전체/안읽음 필터, 명시적 읽음과 프로젝트 이동 분리. 조회만으로 읽음 처리하지 않는다. |
| 비파괴성 | 알림 삭제/거래 상태 변경 기능 없음. 모두 읽음이 목록 밖도 포함함을 안내한다. |
| 접근 가능성 | 버튼·링크·시간 태그·읽음 텍스트·focus/live·reduced-motion 적용. 320px/Enter·읽음 및 재시도 focus 실제 확인. OS 스크린리더·200% 확대는 미검증. |

## 아직 안 되는 것 (Known Issues)

- `features/notifications/` 담당 구현이며 app 통합·배포는 하지 않았다.
- Mock 저장소는 휘발성. 실제 DB unique/트랜잭션·다중 인스턴스·재시작 복구는 별도 검증 필요.
- 현재 app 발행 이벤트는 수신자·eventId가 부족하고 closure reason이 소실된다.
- 능동 마감 scheduler가 없고 deadlineNotifiedAt 기록이 발송 성공보다 앞선다. 10분 SLA 미충족 가능.
- preview의 프로젝트 링크는 실제 라우트 계약을 보여주지만 가상 ID이므로 실제 프로젝트 상세 E2E가 아니다.
- 공통 디자인 검사 baseline 실패는 다른 담당/팀장 수정사항이다.

## 팀장에게 물어봐야 하는 것

- CR-0001: notifications 담당표 인수 반영, 마감 수신자(PENDING vs 지원자 전원), API 승인.
- CR-0001: app DB/실인증/웹·헤더 연결과 upstream 사건 snapshot·durable retry·scheduler 통합.
