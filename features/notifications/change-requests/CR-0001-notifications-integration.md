---
title: "notifications 인수·마감 수신자·원천 이벤트 통합"
status: "제안"
requested_by: "오민혁"
date: "2026-09-07"
affected_docs: [docs/domain/reference/prd-v6.4.md, docs/domain/api-spec/applications-notifications.md, .github/CODEOWNERS]
affected_features: [notifications, applications, project-management]
---

# 스펙 변경 신청

## 배경 (왜 필요한가)

2026-09-07 오민혁 사용자가 notifications 범위 직접 구현을 요청했다. 다른 담당자의 로컬
작업 존재를 가정하지 않고 develop b945f7c의 빈 notifications 틀에서 필수 6종을 구현한다.
아래 공유 정책/통합 수정은 담당자 `features/notifications/` 밖이어서 이 PR에서 변경하지 않는다.

## 현재 스펙

- PRD §5.6: "알림은 전부 최윤석이 만듭니다." → 공유 담당표 갱신 확인 필요.
- 자연 마감 §2.3: "대기 중이던 지원자". §5.6 표: "지원자 전원".
- 알림 실패는 본 작업을 되돌리지 않으며, 마감 알림 지연은 최대 10분.
- D13: 알림 삭제 없이 최근 100건만 표시.

## 제안하는 변경

### 1. 담당·API 승인

notifications 구현 담당을 오민혁으로 반영하되 applications 소유권은 변경하지 않는다.
이 폴더 api-contract.md의 목록/미읽음/개별·전체 읽음 4개 API를 검토해 공유 사본에 반영한다.
미읽음 badge 및 전체 읽음은 최신 100건 밖도 포함한다. 화면에 범위를 안내한다.

### 2. 마감 수신자 결정

더 구체적인 §2.3에 따라 마감 직전 PENDING 대상만 받는 것으로 잠정 구현한다.
이미 거절된 지원자까지 포함하는 것으로 확정되면 producer의 recipientIds snapshot만 바꾸면 된다.
notifications 소비자가 변경 이후 application.status를 다시 읽어 대상을 복원하지 않는다.
취소는 명확한 PENDING + 선정 프리랜서 합집합을 유지한다.

### 3. 원천 이벤트·재시도 handoff

확인 기준 b945f7c:

- `app/server/src/features/applications/application.types.ts:164` 이벤트에는
  type/projectId/applicationId/occurredAt만 있다. 인증된 조립 지점에서 프로젝트 clientId와
  해당 application의 freelancerId를 읽고 projectId 일치 검증 후 내부 입력으로 정규화한다.
- `applications-port.adapter.ts:25`가 받는 closureEventId/reason은 발행 시 소실된다.
  마감/취소 자동거절을 "다른 지원자 선정"으로 소비하지 말고 별도 closure 이벤트로 전달한다.
  상태 변경 전 수신자 스냅샷을 사건과 함께 보관한다. 같은 closure에 두 종류를 중복 생성하지 않는다.
- `application.service.ts:75`의 발행 오류 삼키기와 기존 결과 반환만으로는 유실을 재처리할 수 없다.
  도메인 커밋과 안정적인 사건 기록(outbox)을 결합하고, 안전 전달 결과 delivered인 경우만 ACK한다.
  부분 생성 실패는 같은 사건 키로 재시도한다. 검증 실패/지속 장애는 무한 재시도하지 말고
  상한·실패 보관·운영 관측을 둔다. notifications Mock의 메모리를 durable queue로 보지 않는다.
- `express-app.ts:247`/`:340`의 인메모리 발행 port를 같은 notifications adapter로 연결한다.
  `applicationRepository.getApplication/getByProject`, 프로젝트 협상 context/카드 조회는
  좁은 delegate로 조립하며 feature 간 직접 import를 만들지 않는다.

### 4. 자연 마감 운영 게이트

- 현재 `project-read.service.ts:70`은 표시만 CLOSED로 보정한다. 사용자 조회와 무관한
  능동 scheduler가 필요하다. 기존 사용자 소유자 인증 경로를 서비스용 공개 우회 경로로 열지 않는다.
- `project.service.ts:613` 주변은 알림 성공 전에 deadlineNotifiedAt을 채운다.
  안정적 closureEventId 및 전달/ACK 성공 후 기록으로 조정하고 실패 건이 다시 처리되도록 한다.
- scheduler 간격+재시도 지연을 합쳐 deadline→알림 저장 10분 이내임을 운영 환경에서 검증한다.

## 영향 범위

팀장: app server 인증 resolver·DB repository(기존 Notification 모델 unique dedupeKey 활용),
라우터·에러·CORS 정책·웹 `/notifications` 및 공통 헤더 배지 연결, 공유 문서/담당표 반영.
applications/project-management: 수신자 확정·상태 변경 전 snapshot·사건 키·능동 마감·ACK.
운영: 저장 내구성·worker 재시작·다중 인스턴스 재전달·10분 SLA 검증.
REVIEW_CREATED 평점 캐시는 user-management의 별개 책임으로 이번 연결에 포함하지 않는다.

## 대안으로 검토했던 것

- 현재 AUTO_REJECTED를 그대로 구독: 마감/취소를 다른 선정으로 잘못 알리고 선정자 취소 알림을 누락해 기각.
- 목록 조회 시 마감 검사: 아무도 조회하지 않으면 10분 요구를 지키지 못해 기각.
- 메모리 retry queue만으로 운영 완료 선언: 재시작·서버리스 다중 인스턴스에서 유실되어 기각.
- notifications가 다른 기능 상태·스키마를 직접 수정: 담당 경계를 넘어 이 PR에서는 하지 않는다.
