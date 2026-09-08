# user-management

- 담당자: 오민혁
- 현재 단계: Step 4 — high-fi·구현 초안·자동 검증
- 포함: 이메일/OAuth 가입·로그인, 이메일 확인, 고립 계정 가입 복구, 세션·안전한 `returnTo`,
  회원 탈퇴의 PROVISIONAL spec/API 계약과 비활성 UI prototype, 서버 내부 프로필 완성도 조회 포트,
  REVIEW_CREATED 사용자 평점 캐시 소비와 신규 인증 ULID 식별자 생성
- 제외: 프로필 상세, 비밀번호 재설정, 회원 탈퇴 API client·서버·DB·worker 구현, `app/` 통합과 배포 설정

## 작업 원본

- `spec.md` — 23개 인증 규칙, 탈퇴 잠정 규칙 WD-01~WD-08, 프로필 조회 PC-01~PC-08
- `api-contract.md` — BFF 인증 API 계약, 검토용 탈퇴 계약, 내부 프로필 완성도 조회 계약
- `prototype/server/profile-completion.service.ts` — `createProfileCompletionPort(repository)` 진입점
- `change-requests/0001-profile-completion-integration.md` — applications/DB/PM 통합 요청 및 정본 차이
- `prototype/server/user-rating.service.ts` — 공개 집계 재조회·원자적 캐시 갱신 소비 진입점
- `change-requests/0002-user-rating-and-auth-id-integration.md` — 평점/ULID30 app·DB·전달 통합 요청
- `design/high-fi.html` — 로그인 high-fi
- `design/high-fi-sign-up.html` — 회원가입·가입 복구 high-fi
- `design/high-fi-email-confirmation.html` — 이메일 확인 high-fi
- `design/high-fi-account-withdrawal.html` — 회원 탈퇴 상태별 high-fi(실제 요청 미전송)
- `prototype/` — 서버·웹·Mock 구현 초안과 `run.tsx` 검증
- `test-report.md` — 검증 결과, UX 자체 점검, 미해결 통합 조건

## 2026-09-08 담당 후속 증분

공개 REVIEW_CREATED 소비와 users 평점 캐시 갱신을 포트·Mock·테스트로 구현했다. 사용자별 잠금
획득 후 합계를 새로 읽고 두 캐시 필드를 한 번에 교체한다. 중복·역순 이벤트, 실패/rollback,
사용자 격리·탈퇴와 기존 ID 호환을 검증했다. 신규 사용자·세션 ID만 ERD의 prefixed ULID30으로
맞췄으며 기존 ID/공급자 UUID는 변경하지 않는다. 전체 자동 검증 **101 PASS**
(기존 프로필 증분 77 + 평점 18 + ID 6), strict/preview build PASS. 운영 DB/worker/app 통합과 배포는 미완료다.
새 화면은 없으며 기존 인증 피드백은 담당자 결정 없이 종결하지 않았다.

## 2026-09-08 프로필 포트 증분 (앞선 기록)

`getProfileCompletion(userId)`의 역할별 필수 조건과 COMPLETE/INCOMPLETE/UNAVAILABLE를 구현했다.
현재 6종 enum을 사용하고 저장 시각을 임의로 만들지 않는다. 읽기 snapshot과 인메모리 Mock을
분리했다. 실제 DB adapter·프로필 저장/화면·지원 게이트·app 연결은 팀장 통합 후속이며,
화면/디자인 변경은 없다. 전체 검증은 `npx tsx features/user-management/prototype/run.tsx`,
strict 검사는 `npx tsc -p features/user-management/prototype/tsconfig.json`으로 실행한다.
2026-09-08 검증: 기존 53개 + 프로필 24개 = 77 PASS, strict/preview build PASS,
applications 포트 주입 smoke 6개 시나리오 PASS. 실제 DB/app 통합 성공을 의미하지 않는다.

## 2026-09-04 상태 (이전 기록)

가입과 이메일 확인 화면은 최신 feature high-fi 구조와 디자인 토큰에 맞춰 보완했다. 참조 화면은
폼 리듬과 상태 안내 순서만 사용했으며 API·업무 규칙은 변경하지 않았다. 실제 앱 router 연결,
fragment의 pre-React bootstrap, 단일 AuthProvider 상태 소유권, 영속 DB 저장소와 배포 rewrite는
팀장 통합 전까지 완료로 보지 않는다. 성공·오류 DTO runtime 검증, token query 제거, 확인 재시도·
현재 세션 로그아웃 경계까지 보완했다. 회원 탈퇴는 `/settings/account/withdrawal`의 상태별 high-fi와
네트워크 없는 React 화면만 추가했다. API·재인증 proof 발급·DB transaction·provider cleanup은 여전히
review gate 대상이다. feature 자동 검증은 53/53이며 strict scoped TypeScript와 preview production
build를 통과했다.
