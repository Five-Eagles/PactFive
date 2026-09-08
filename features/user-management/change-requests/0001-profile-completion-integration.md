---
title: "프로필 완성도 포트의 applications 연결 및 저장소·실패 계약"
status: "제안"
requested_by: "오민혁"
date: "2026-09-08"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/reference/prd-v6.4.md]
affected_features: [user-management, applications, project-management]
---

# 스펙 변경 신청

> 2026-09-08 후속: 아래 6번의 **feature 기본 생성기**는
> `0002-user-rating-and-auth-id-integration.md`에서 ULID30으로 보정했다. 이 문서는 최초
> 프로필 증분의 근거 기록을 유지한다. app 생성기 반영·기존 36자 자료 조사는 여전히 후속이다.

## 배경 (왜 필요한가)

2026-09-08 회의 및 담당자 요청으로 user-management 내부 조회 포트를 착수했다.
현재 develop `ec1c01f`의 applications prototype은 3상태 ProfileCompletionPort를 받지만,
`app/server/src/features/applications/application.types.ts`는 제공자가 없다는 이유로 검사를
이식하지 않았다. 이번 변경은 user-management의 포트·판정·Mock·테스트만 제공한다.

## 현재 스펙

- PRD D-58: `getProfileCompletion(userId) → { status, completedAt, missingFields }`.
- ERD E-14: 완성 여부는 필수 항목의 파생 상태이며, 필수 필드 저장 완료 시 완성이면 now(),
  미완성이면 NULL을 저장한다. 기술 연결 해제/비활성화도 재판정 대상이다. 요약 ERD의
  “최초 완성 시각” 표현과 달리 원본 저장 규칙을 따른다.
- applications는 COMPLETE/INCOMPLETE/UNAVAILABLE을 지원한다. UNAVAILABLE를
  DEPENDENCY_UNAVAILABLE(503)로, 미완성 지원 POST를 PROFILE_INCOMPLETE(409)로 처리한다.
- project-management `prototype/server/ports/external.port.ts`의 ProfilePort는 2상태만
  지원한다. 현재 서비스는 COMPLETE가 아니면 403으로 처리하므로 조회 장애와 미완성을 구분하지 못한다.
- ERD의 실제 business_field와 Prisma BusinessField는 D-91/E-27 이후 6종이며 ETC가 없다.
  옛 profile 설명·CHECK에는 ETC가 남아 있다.

## 제안하는 변경

1. **applications / 팀장:** 기존 3상태 포트에 `createProfileCompletionPort(repository)`를
   조립 지점에서 주입한다. 인증된 PactFive `users.id`를 전달한다(Supabase authUserId 아님).
   eligibility뿐 아니라 실제 지원 POST에서도 다시 확인한다. 역할/프로젝트 권한 검사는 유지한다.
   unknown 계정을 COMPLETE로 처리하는 기존 applications 기본 Mock을 운영 대체재로 쓰지 않는다.
2. **팀장 / DB:** `ProfileCompletionRepository`의 일관된 snapshot adapter를 구현한다.
   사용자 role/deletedAt, 그 역할의 본인 profile, freelancer_skills로 연결된 skill의 활성 상태를
   같은 DB snapshot에서 읽는다. 전체 skills 카탈로그를 연결 기술처럼 반환하지 않는다.
   Prisma Date는 UTC ISO 문자열로 변환한다. 레코드 없음과 저장 장애를 분리하고 조회는 쓰기를 하지 않는다.
3. **프로필 저장 후속:** 프로필 저장·기술 변경과 `completed_at` 갱신을 같은 트랜잭션으로 처리한다.
   이번 조회 포트는 필드가 완성됐어도 저장 시각이 없으면 UNAVAILABLE를 반환한다. 기존 NULL 시각
   데이터의 보정이 필요하면 별도 승인된 백필을 수행한다. 조회 시 now()를 만들어 숨기지 않는다.
   저장/조회가 분리된 사이에 프로필이 바뀌는 TOCTOU 방지는 실제 지원 트랜잭션 통합 시 검증한다.
4. **project-management / 유동우:** UNAVAILABLE 상태와 서비스 오류(503) 매핑을 먼저 합의한다.
   단언 캐스팅이나 INCOMPLETE 치환으로 기존 2상태 포트에 억지 연결하지 않는다.
   기존 mock의 phone 누락 필드는 ERD 필수 목록에 없으므로 새 정본 missingFields 코드에 맞춘다.
5. **공유 문서 / 팀장:** ETC 잔존 설명과 “최초 완성” 요약을 실제 enum/저장 규칙에 맞춘다.
   기타 입력을 다시 지원하려면 별도 제품 결정 및 enum·스키마·폼 계약 동기화가 먼저다.
6. **기존 ID/DB 정합성:** 인증 prototype의 기본 `nextUserId`는 `usr_` + UUID 32자로 36자이지만,
   users.id 정본은 varchar(30)이다. 이번 조회 포트는 기존 ID를 불투명하게 받아 정확히 조회하므로
   인증 흐름을 추가로 차단하지 않는다. 다만 실제 DB 가입/조회 호환은 생성기와 DB 제약의 별도
   정합성 확인이 필요하다. 이번 증분에서 기존 인증 코드나 스키마를 변경하지 않는다.

## 영향 범위

현재 PR은 `features/user-management/**`만 변경한다. app, 공유 DB/API, applications 및
project-management 파일·UI·기존 인증/탈퇴 동작은 변경하지 않는다. 이전 두 인증·AI 오류의
app 직접 수정 예외 승인은 이 새 기능으로 확대하지 않는다.

팀장 통합 완료 조건: 실제 DB snapshot adapter, 프로필 저장 시각 갱신 경로, 지원 전 게이트,
미완성 프로필을 채울 화면/복귀 동선까지 확인한다. 그 전에는 포트 구현을 실제 지원 차단 배포
완료로 보고하지 않는다. 신설 HTTP 프로필 API 경로는 이 CR에서 결정하지 않는다.

## 대안으로 검토했던 것

- completed_at만 검사: 필드 누락·마지막 기술 비활성화 뒤의 오래된 시각으로 통과할 수 있어 기각.
- 매 조회 시 완성 시각을 생성/저장: 조회가 쓰기가 되고 저장 시점 불일치를 숨겨 기각.
- 사용자 없음/장애면 COMPLETE: 게이트 우회이므로 기각.
- 미완성이면 탈퇴/인증 오류를 반환: 프로필 입력 부족과 인증 실패를 혼동하므로 기각.
- 다른 feature 또는 app를 함께 수정: 이번 담당 범위 밖이므로 소비 계약과 통합 요청으로 분리.
