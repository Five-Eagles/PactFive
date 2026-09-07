# notifications 테스트 결과

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
