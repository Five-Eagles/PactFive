# ERD (엔티티 관계 다이어그램)

| 항목 | 내용 |
|---|---|
| 원본 | `docs/domain/reference/erd-v1.4.html` (DBML: `docs/domain/reference/erd-v1.4.dbml`) |
| 작성 | 김락원 (팀장) |
| 버전 | v1.4 |
| 근거 | `docs/domain/prd.md` §6 데이터 모델 (PRD v6.4 대조 완료) |
| 반영일 | 2026-08-25 |
| 상태 | **구현 초안 확정** — 엔티티 수 고정 원칙은 폐기되었다(D-62·D-70·D-78 종결). 새 엔티티는 담당자를 명시하고 §6.10 검증 범위에 추가하는 방식으로 계속 확장될 수 있다 |

이 문서는 원본을 요약한 포인터입니다. 필드 단위 상세, 불변식 30개 매핑, DBML로 표현 못하는
SQL 제약, 확장 지점은 원본 HTML을 직접 엽니다.

## 엔티티 19종 (담당자별)

| 담당자 | 엔티티 |
|---|---|
| 오민혁 | `users`, `auth_sessions`, `client_profiles`, `freelancer_profiles`, `skills`, `freelancer_skills` |
| 유동우 | `projects`, `project_skills`, `bookmarks` |
| 최윤석 | `applications`, `notifications` |
| 조준영 | `agreements`, `negotiation_offer`, `contracts`, `contract_signature_audits`, `payments`, `deliveries`, `reviews` |
| 오민혁 | `pricing_analyses` |

`auth_sessions`(E-22)와 `negotiation_offer`(E-25)는 v1.3~v1.4에서 신설된 엔티티다 — 과거 v1.2의
"17종 고정" 원칙(구 E-01)은 PRD §6.1 D-62에서 이미 폐기된 것으로 확인되어 철회됐다 (아래
"최근 확정 사항" 참고). 담당자는 자기 담당 절만 확인하면 된다 (원본 §6.10 검증 범위).

## enum 값 목록 (저장 enum 12종)

아래가 DB에 저장되는 enum의 전체 값이다. **여기 없는 값을 새로 만들지 않는다.** 네이밍 컨벤션
§9가 "실제 값 목록의 정본은 ERD"로 지정하고 있어, 담당자가 이 문서만 읽고도 구현할 수 있도록
원본 DBML(`erd-v1.4.dbml`)의 Enum 블록을 여기 옮겨둔다. 값이 바뀌면 원본 → 이 표 순으로 고친다.

| enum | 값 | 담당 |
|---|---|---|
| `user_role` | `CLIENT` · `FREELANCER` | 오민혁 |
| `recruitment_status` | `SCHEDULED` · `OPEN` · `CLOSED` | 유동우 |
| `project_transaction_status` | `NONE` · `CONTRACT_PENDING` · `IN_PROGRESS` · `COMPLETED` · `CANCELED` | 유동우 |
| `application_status` | `PENDING` · `ACCEPTED` · `REJECTED` | 최윤석 |
| `application_rejection_type` | `DIRECT` · `AUTO_OTHER_ACCEPTED` · `AUTO_RECRUITMENT_CLOSED` · `AGREEMENT_DECLINED` | 최윤석 |
| `agreement_status` | `PROPOSED` · `ACCEPTED` · `REJECTED` | 조준영 |
| `contract_status` | `DRAFT` · `SIGNING` · `SIGNED` · `CANCELED` | 조준영 |
| `payment_status` | `READY` · `PENDING` · `PAID` · `FAILED` · `RELEASED` · `REFUNDED`(MVP 미구현) | 조준영 |
| `delivery_status` | `IN_PROGRESS` · `DELIVERY_REQUESTED` · `APPROVED` | 조준영 |
| `review_direction` | `CLIENT_TO_FREELANCER` · `FREELANCER_TO_CLIENT` | 조준영 |
| `pricing_analysis_review_status` | `PENDING` · `APPROVED` · `REJECTED` | 오민혁 |
| `oauth_provider` | `GOOGLE` · `KAKAO` | 오민혁 |

공통 코드 성격의 enum 3종 (PRD §8.1·§8.2 목록과 동일해야 함):

| enum | 값 |
|---|---|
| `project_category` | `WEB_DEVELOPMENT` · `APP_DEVELOPMENT` · `DESIGN` · `MARKETING` · `PLANNING` · `ETC` (6종, D-12) |
| `business_field` | `project_category`와 같은 6종 재사용. `ETC`일 때만 `business_field_etc` 자유 입력 |
| `skill_group` | `FRONTEND` · `BACKEND` · `MOBILE` · `DATA_INFRA` · `DESIGN` · `MARKETING` · `PLANNING` · `ETC` (8종, 필터 UI 그룹핑용) |

알림 종류 `notification_type` (13값)은 **네이밍 컨벤션 §10 `NotificationType`이 정본**이며 이
ERD와 항상 같은 목록이어야 한다 (PRD D-76·D-86).

### 저장하지 않는 상태 하나

`NegotiationStatus`(`NOT_STARTED` · `NEGOTIATING` · `AGREED` · `REJECTED`)는 **DB enum이 아니다.**
`negotiation_offer`의 최신 라운드와 최종 `agreement_status`에서 계산해 API 응답에만 싣는다
(PRD D-88). 이 값을 저장하는 컬럼을 만들지 않는다.

## users 엔티티 (샘플 로그인 기능이 참조하는 핵심 테이블)

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | `usr_01H8X…` 형식 |
| `email` | varchar(255) | NOT NULL, 부분 UNIQUE(활성 사용자 범위) | 소셜 로그인 연동 키 |
| `password_hash` | varchar(255) | NULL | 해싱 저장. 소셜 전용 계정은 비어 있음 |
| `name` | varchar(50) | NOT NULL | 이름 |
| `role` | `user_role` enum | NOT NULL | `CLIENT` \| `FREELANCER` |
| `profile_image_url`, `bio` | text | NULL | 공통 프로필 |
| `oauth_provider`, `oauth_subject` | enum, varchar | UNIQUE(둘 조합) | Google/Kakao |
| `rating_average`, `review_count` | numeric, integer | — | 리뷰 평균 캐시. `REVIEW_CREATED` 이벤트로만 갱신 |
| `last_login_at` | timestamptz | NULL | 마지막 로그인 시각 |
| `deleted_at` | timestamptz | NULL | 소프트 삭제. 탈퇴 시 세션·OAuth 무효화, 진행 거래 있으면 409 |

**(v1.4 변경)** `refresh_token_hash` 컬럼은 `users`에서 제거됐다. 다중기기 세션 테이블
`auth_sessions` 신설이 v1.2에서는 "17종 고정" 원칙(구 E-01)을 근거로 반려됐었지만(구 E-11),
그 근거였던 원칙 자체가 PRD §6.1 D-62에서 이미 폐기된 것으로 확인되어(E-22) 철회하고
정규화 테이블로 전환했다. 토큰 해시·rotation·재사용 탐지는 아래 `auth_sessions` 참고.

인증 컨텍스트는 `Authorization: Bearer <token>` 헤더로 전달한다 (PRD §1.4).

## `auth_sessions` 엔티티 (v1.3 신설 — E-22, 오민혁 담당)

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | `ses_...` |
| `user_id` | varchar(30) | NOT NULL | `users` 참조 |
| `refresh_token_hash` | varchar(255) | NOT NULL, UNIQUE | 원문은 저장하지 않음(HttpOnly 쿠키로만 전달) |
| `previous_token_hash` | varchar(255) | NULL | rotation 시 직전 해시. 재사용 감지 판정 기준 |
| `device_label` | varchar(100) | NULL | 사용자에게 보여줄 기기 표시용 (예: Chrome on macOS) |
| `issued_at` | timestamptz | NOT NULL | 발급 시각 |
| `expires_at` | timestamptz | NOT NULL | 만료 시각 |
| `last_used_at` | timestamptz | NULL | 마지막 사용 시각 |
| `revoked_at` | timestamptz | NULL | 폐기 시각 |
| `revoked_reason` | varchar(30) | NULL | `LOGOUT` \| `LOGOUT_ALL` \| `REUSE_DETECTED` \| `PASSWORD_CHANGED` \| `USER_WITHDRAWN` |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |

갱신 규칙: refresh 요청마다 `refresh_token_hash`를 교체(rotation)하고 직전 값을 
`previous_token_hash`로 옮긴다. `previous_token_hash`와 일치하는 토큰이 재사용되면 해당 세션을
즉시 폐기(`revoked_reason='REUSE_DETECTED'`). 비밀번호 변경·전체 로그아웃 시 사용자의 미폐기
세션 전체를 일괄 `revoked_at` 처리. 물리 삭제하지 않는다(감사 목적 보존).

## 엔티티별 필드 정의 (users · auth_sessions 제외 17종)

**(Fact)** 컬럼명·타입·NOT NULL 여부는 원본 `docs/domain/reference/erd-v1.4.html`의 다이어그램에서
직접 추출한 값입니다. **(Assumption)** "의미" 칸 중 원본 프로즈(설계 원칙, 확장 지점 설명)에
근거가 있는 항목은 그 근거를 함께 표시했고, 근거 없이 필드명만으로 추정한 항목은 "추정"이라고
명시했습니다. FK 대상을 확신할 수 없는 항목은 억지로 채우지 않고 "원본 관계도(§2) 참고"로
남겼습니다 — 틀린 추측을 사실처럼 적어두는 것보다 낫다고 판단했습니다.

담당자는 자기 담당 엔티티만 확인하면 됩니다. **다만 이 표는 SPEC 작성의 출발점일 뿐**이고,
"의미"가 "—"이거나 "추정"인 항목, 특히 담당 기능이 실제로 다루는 필드는 원본 §3.x(담당자별
검토 절)를 열어 직접 확인하는 걸 권장합니다.

### 오민혁 담당

#### `client_profiles`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `user_id` | varchar(30) | NOT NULL | `users` 참조 |
| `company_name` | varchar(100) | NOT NULL | — (원본 §3 해당 절 참고) |
| `business_field` | business_field | NOT NULL | — (원본 §3 해당 절 참고) |
| `business_field_etc` | varchar(100) | NULL | `business_field`가 기타일 때의 자유 입력 |
| `website_url` | text | NULL | — (원본 §3 해당 절 참고) |
| `completed_at` | timestamptz | NULL | 프로필 최초 완성 시각 (필수 항목 다 채운 시점) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `freelancer_profiles`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `user_id` | varchar(30) | NOT NULL | `users` 참조 |
| `primary_category` | project_category | NOT NULL | 주력 분야 (프로젝트 `category`와 같은 enum 공유 추정 — 원본 §3 확인) |
| `career_years` | smallint | NOT NULL | — (원본 §3 해당 절 참고) |
| `hourly_rate_amount` | integer | NULL | 희망 시급 |
| `portfolio_url` | text | NULL | — (원본 §3 해당 절 참고) |
| `completed_at` | timestamptz | NULL | 프로필 최초 완성 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `skills`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(40) | PK | PK |
| `name` | varchar(50) | NOT NULL | — (원본 §3 해당 절 참고) |
| `name_key` | varchar(60) | NOT NULL | 검색·중복 판정용 정규화 키 (소문자·공백 제거 등 추정) |
| `group_code` | skill_group | NOT NULL | 기술 분류 그룹 |
| `display_order` | smallint | NOT NULL | — (원본 §3 해당 절 참고) |
| `is_custom` | boolean | NOT NULL | 팀에서 미리 정의한 기술이 아니라 사용자가 직접 추가한 기술인지 |
| `created_by_user_id` | varchar(30) | NULL | `users` 참조 |
| `is_active` | boolean | NOT NULL | 비활성화 플래그 — 지우지 않고 끈다 (원본 원칙 5: 과거 참조 데이터 보존) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `freelancer_skills`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `freelancer_profile_id` | varchar(30) | NOT NULL | `freelancer_profiles` 참조 |
| `skill_id` | varchar(40) | NOT NULL | `skills` 참조 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |


### 유동우 담당

#### `projects`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `client_id` | varchar(30) | NOT NULL | `users` 참조 (role=CLIENT) |
| `title` | varchar(100) | NOT NULL | — (원본 §3 해당 절 참고) |
| `description` | text | NOT NULL | — (원본 §3 해당 절 참고) |
| `category` | project_category | NOT NULL | — (원본 §3 해당 절 참고) |
| `budget_amount` | integer | NOT NULL | — (원본 §3 해당 절 참고) |
| `recruitment_start_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `recruitment_deadline_at` | timestamptz | NOT NULL | — (원본 §3 해당 절 참고) |
| `recruitment_status` | recruitment_status | NOT NULL | 모집 상태 (`RecruitmentStatus`, PRD §2 정본) |
| `transaction_status` | project_transaction_status | NOT NULL | 거래 상태 (`ProjectTransactionStatus`, PRD §2 정본) — 모집 상태와 별개 축 |
| `application_count` | integer | NOT NULL | 지원 수 캐시 |
| `recruitment_closed_at` | timestamptz | NULL | 모집 마감 처리 시각 |
| `canceled_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `deadline_notified_at` | timestamptz | NULL | 마감 임박 알림 발송 여부 추적 (중복 발송 방지) |
| `pending_application_count` | integer | NOT NULL | **(v1.3 신설, E-23)** 대기(PENDING) 지원 수 캐시. 예산·일정 잠금 판정용. 갱신 주체는 applications 도메인(최윤석) — 원본(`applications.status='PENDING'` 카운트)과 어긋나면 원본이 옳음 |
| `accepted_application_id` | varchar(30) | NULL | **(v1.3 신설, E-23)** 수락된 지원서 id. 수락 멱등 판정(C-01, D-41)의 근거 값 |
| `payment_pending_at` | timestamptz | NULL | **(v1.3 신설, E-23)** `markPaymentPending`(조준영 → 유동우) 통보 시각. 결제 확정 전 취소 가능 구간의 경계 |
| `project_version` | integer | NOT NULL | **(v1.3 신설, E-23)** 낙관적 잠금 버전(D-53). **상태가 실제로 전이됐을 때만 +1** — 계약 호출 자체가 기준이 아니다. 멱등 재호출로 200을 돌려주거나 전이 조건 미충족으로 거부된 경우에는 올리지 않는다 (2026-08-26 정정, E-26 · 질의 Q-09) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |
| `deleted_at` | timestamptz | NULL | 소프트 삭제 시각 |

#### `project_skills`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `project_id` | varchar(30) | NOT NULL | `projects` 참조 |
| `skill_id` | varchar(40) | NOT NULL | `skills` 참조 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |

#### `bookmarks`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `freelancer_id` | varchar(30) | NOT NULL | `users` 참조 (role=FREELANCER) |
| `project_id` | varchar(30) | NOT NULL | `projects` 참조 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |


### 최윤석 담당

#### `applications`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `project_id` | varchar(30) | NOT NULL | `projects` 참조 |
| `freelancer_id` | varchar(30) | NOT NULL | `users` 참조 (role=FREELANCER) |
| `cover_letter` | text | NOT NULL | — (원본 §3 해당 절 참고) |
| `expected_amount` | integer | NOT NULL | — (원본 §3 해당 절 참고) |
| `expected_duration_days` | smallint | NOT NULL | — (원본 §3 해당 절 참고) |
| `status` | application_status | NOT NULL | 지원 상태 (`application_status`) |
| `rejection_type` | application_rejection_type | NULL | 거절 사유 세분류 (거절 상태일 때만) |
| `decided_at` | timestamptz | NULL | 수락/거절 확정 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `notifications`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `recipient_id` | varchar(30) | NOT NULL | `users` 참조 |
| `type` | notification_type | NOT NULL | 알림 종류 (`notification_type`) |
| `title` | varchar(100) | NOT NULL | — (원본 §3 해당 절 참고) |
| `body` | varchar(500) | NOT NULL | — (원본 §3 해당 절 참고) |
| `link_url` | text | NOT NULL | — (원본 §3 해당 절 참고) |
| `resource_type` | varchar(30) | NULL | 다형성 참조 대상 종류 — project/application/contract 등 (원본 원칙 7) |
| `resource_id` | varchar(30) | NULL | 다형성 참조 대상 id. FK 제약 없음 — 대상이 삭제돼도 알림은 안 깨짐 (원본 원칙 7, 최윤석 확인 요청 항목) |
| `dedupe_key` | varchar(120) | NOT NULL | 중복 알림 방지 키 |
| `read_at` | timestamptz | NULL | 읽음 처리 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |


### 조준영 담당

#### `agreements`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `application_id` | varchar(30) | NOT NULL | `applications` 참조 |
| `proposed_by_user_id` | varchar(30) | NOT NULL | `users` 참조 (client/freelancer 둘 다 가능) |
| `agreed_amount` | integer | NOT NULL | — (원본 §3 해당 절 참고) |
| `status` | agreement_status | NOT NULL | 합의 상태 (`agreement_status`) |
| `responded_at` | timestamptz | NULL | 상대가 수락/거절한 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `negotiation_offer` (v1.3 신설 — E-25, v1.4 구현 초안 확정)

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `application_id` | varchar(30) | NOT NULL | `applications` 참조 — 협상 스레드 단위, 한 지원서에 여러 라운드 허용 |
| `round` | smallint | NOT NULL | 1부터 시작. 재제안마다 +1. UNIQUE(application_id, round) |
| `proposed_by_user_id` | varchar(30) | NOT NULL | 이번 라운드 제안자 — 의뢰인/프리랜서 양측 가능 |
| `offered_amount` | integer | NOT NULL | — |
| `status` | agreement_status | NOT NULL | 개별 제안 상태 (`agreement_status` 재사용, 별도 `NegotiationStatus` DB enum은 두지 않음) |
| `responded_at` | timestamptz | NULL | — |
| `rejected_reason` | varchar(30) | NULL | 예: `CLIENT_REJECTED` (전체 코드 목록은 조준영 확인 필요) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |

`agreements`는 "최종 합의 결과", `negotiation_offer`는 "라운드별 제안 이력"으로 병행한다.
협상 전체 상태(`NegotiationStatus`: NOT_STARTED/NEGOTIATING/AGREED/REJECTED)는 별도 컬럼·enum으로
저장하지 않고 최신 라운드 및 최종 `agreement_status`로 계산한다 (D-81·D-82, PRD 부록 E).

#### `contracts`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `agreement_id` | varchar(30) | NOT NULL | `agreements` 참조 |
| `project_id` | varchar(30) | NOT NULL | `projects` 참조 |
| `client_id` | varchar(30) | NOT NULL | `users` 참조 (role=CLIENT) |
| `freelancer_id` | varchar(30) | NOT NULL | `users` 참조 (role=FREELANCER) |
| `project_title_snapshot` | varchar(100) | NOT NULL | 계약 시점 프로젝트 제목 스냅샷 — 원본 프로젝트가 나중에 바뀌어도 계약서는 그대로 |
| `agreed_amount` | integer | NOT NULL | — (원본 §3 해당 절 참고) |
| `work_start_date` | date | NOT NULL | — (원본 §3 해당 절 참고) |
| `work_end_date` | date | NOT NULL | — (원본 §3 해당 절 참고) |
| `terms_snapshot` | jsonb | NOT NULL | 계약 조항 전문 (jsonb, 스키마리스 — 원본 참고) |
| `status` | contract_status | NOT NULL | 계약 상태 (`contract_status`) |
| `client_signed_at` | timestamptz | NULL | 의뢰인 서명 시각 |
| `freelancer_signed_at` | timestamptz | NULL | 프리랜서 서명 시각 |
| `signed_at` | timestamptz | NULL | 양측 서명 완료(계약 성립) 시각 |
| `canceled_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `contract_signature_audits`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `contract_id` | varchar(30) | NOT NULL | `contracts` 참조 |
| `signer_id` | varchar(30) | NOT NULL | `users` 참조 |
| `signer_role` | user_role | NOT NULL | 서명자가 client였는지 freelancer였는지 |
| `signed_at` | timestamptz | NOT NULL | — (원본 §3 해당 절 참고) |
| `ip_address` | varchar(45) | NULL | 서명 시 IP — 분쟁 대비 증빙 |
| `user_agent` | varchar(300) | NULL | 서명 시 브라우저/기기 정보 — 분쟁 대비 증빙 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |

#### `payments`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `contract_id` | varchar(30) | NOT NULL | `contracts` 참조 |
| `client_id` | varchar(30) | NOT NULL | `users` 참조 (role=CLIENT) |
| `freelancer_id` | varchar(30) | NOT NULL | `users` 참조 (role=FREELANCER) |
| `currency` | char(3) | NOT NULL | 통화 코드 (예: KRW) |
| `payment_amount` | integer | NOT NULL | 결제 총액 |
| `platform_fee_amount` | integer | NOT NULL | 플랫폼 수수료 (금액으로 저장, 비율 아님 — 원본 원칙 6) |
| `settlement_amount` | integer | NOT NULL | 정산액 = 결제액 − 수수료 (금액으로 저장 — 원본 원칙 6) |
| `status` | payment_status | NOT NULL | 결제 상태 (`payment_status`) |
| `pg_provider` | varchar(20) | NOT NULL | PG사 |
| `pg_order_id` | varchar(64) | NOT NULL | 가맹점측 주문 ID |
| `pg_payment_key` | varchar(200) | NULL | PG사측 결제 키 |
| `payment_method` | varchar(30) | NULL | — (원본 §3 해당 절 참고) |
| `raw_response` | jsonb | NULL | PG 콜백 원문 (jsonb) — 결제 분쟁 시 원본 근거 |
| `paid_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `failed_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `released_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `refunded_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `failure_code` | varchar(50) | NULL | — (원본 §3 해당 절 참고) |
| `failure_message` | varchar(300) | NULL | — (원본 §3 해당 절 참고) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `deliveries`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `contract_id` | varchar(30) | NOT NULL | `contracts` 참조 |
| `status` | delivery_status | NOT NULL | 납품 상태 (`delivery_status`) |
| `message` | text | NULL | — (원본 §3 해당 절 참고) |
| `attachment_url` | text | NULL | — (원본 §3 해당 절 참고) |
| `requested_at` | timestamptz | NULL | 납품(검수 요청) 시각 |
| `approved_at` | timestamptz | NULL | 검수 승인 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

#### `reviews`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `project_id` | varchar(30) | NOT NULL | `projects` 참조 |
| `contract_id` | varchar(30) | NOT NULL | `contracts` 참조 |
| `reviewer_id` | varchar(30) | NOT NULL | `users` 참조 (평가를 남긴 쪽) |
| `reviewee_id` | varchar(30) | NOT NULL | `users` 참조 (평가를 받는 쪽) |
| `direction` | review_direction | NOT NULL | 리뷰 방향 — client→freelancer 인지 freelancer→client 인지 (`review_direction`) |
| `rating` | smallint | NOT NULL | 평점 |
| `comment` | text | NULL | — (원본 §3 해당 절 참고) |
| `tags` | jsonb | NOT NULL | 평가 태그 배열 (jsonb) — 태그 목록 미확정 상태로도 진행 가능하게 스키마리스로 둠 (원본 참고) |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |


### 오민혁 담당

#### `pricing_analyses`

| 컬럼 | 타입 | 제약 | 의미 |
|---|---|---|---|
| `id` | varchar(30) | PK | PK |
| `requester_id` | varchar(30) | NOT NULL | `users` 참조 |
| `project_id` | varchar(30) | NULL | `projects` 참조 |
| `input_snapshot` | jsonb | NOT NULL | AI 분석 요청 시점의 입력값 스냅샷 (jsonb) |
| `recommended_amount` | integer | NOT NULL | AI 추천 금액 |
| `breakdown` | jsonb | NOT NULL | 추천 금액 산출 근거 (jsonb) |
| `model_name` | varchar(50) | NULL | 사용한 AI 모델 |
| `prompt_version` | varchar(20) | NULL | 프롬프트 버전 — 재현성 추적용 |
| `result_schema_version` | varchar(20) | NULL | `breakdown`/`input_snapshot`의 스키마 버전 |
| `failure_code` | varchar(50) | NULL | — (원본 §3 해당 절 참고) |
| `idempotency_key` | varchar(100) | NOT NULL | 중복 요청 방지 키 |
| `request_fingerprint` | varchar(64) | NULL | 요청 내용 해시 (캐싱/중복 탐지 추정) |
| `review_status` | pricing_analysis_review_status | NOT NULL | 담당자가 AI 추천을 검토했는지 (`pricing_analysis_review_status`) |
| `reviewed_at` | timestamptz | NULL | — (원본 §3 해당 절 참고) |
| `applied_at` | timestamptz | NULL | 추천 금액을 실제 프로젝트에 적용한 시각 |
| `created_at` | timestamptz | NOT NULL | 생성 시각 |
| `updated_at` | timestamptz | NOT NULL | 수정 시각 |

## 최근 확정 사항 (Decision Log 요약)

- 서비스명 WorkBridge → **PactFive** 변경 (E-10)
- 완전 회원탈퇴 절차 확정 — 탈퇴 시 세션 무효화, 진행 거래 있으면 차단, 재가입은 새 `user_id` (E-12)
- `rating_average` 캐시는 유지하되 갱신 주체를 `REVIEW_CREATED` 이벤트로 못박음 (E-13)
- **(v1.3~v1.4)** 엔티티 수 "17종 고정" 원칙(구 E-01) **철회** — PRD §6.1 D-62·D-70·D-78이 이미 그
  원칙을 폐기했음이 확인되어, 이를 근거로 반려됐던 `auth_sessions` 신설(구 E-11)을 철회하고
  정규화 테이블로 신설 (E-22). 다중기기 로그인 세션은 기기별 조회·강제 로그아웃·재사용 탐지처럼
  행 단위 조작이 잦아 jsonb보다 정규화 테이블이 적합하다고 판단
- **(v1.3)** `projects`에 컬럼 4종 추가 — `pending_application_count`, `accepted_application_id`,
  `payment_pending_at`, `project_version` (E-23, PRD D-65 종결)
- **(v1.3, v1.4 구현 초안 확정)** `negotiation_offer` 신설 — 다회차 금액 협상 이력 보존
  (E-25, PRD D-72). `NegotiationStatus`는 DB enum으로 만들지 않고 API 파생 상태로 계산 (D-81·D-82)
- **(v1.4)** 알림 종류(`notification_type`) 13종을 네이밍 컨벤션 §10 `NotificationType`과
  동일하게 고정 (PRD D-76)
- **(v1.4)** 재모집 시 모집 마감일(365일 상한) 기준점을 "현재 모집 회차 시작 시각"으로 명확화
  (I-28, PRD D-85). 재모집 API(A-13)의 처리 순서는 **시작 시각 갱신 → 상한 검증**이다 — PRD
  v6.4 D-90이 이 규칙을 A-13 스펙 본문에 명시했다 (이전에는 ERD 컬럼 주석에만 있었음)

엔티티 수 고정 원칙 폐기(D-62·D-70)에 따라 앞으로도 새 엔티티는 담당자 명시 + §6.10 검증 범위
추가만으로 계속 신설될 수 있다. 전체 Decision Log는 원본 §9(Decision Log), PRD 부록 E 참고.
