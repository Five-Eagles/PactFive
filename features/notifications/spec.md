# notifications — SPEC

담당자: 오민혁 · 2026-09-07 사용자 인수 요청 기준. 공유 담당표 변경은 팀장 확인 필요.
상태: 담당 기능 구현 초안. `app/` 통합·실제 DB·운영 스케줄러는 별도 검증한다.

## 목적

프로젝트 지원·선정·마감·취소 사실을 해당 당사자에게 인앱 알림으로 전달하고,
본인의 알림 확인·읽음 처리·관련 프로젝트 이동을 제공한다.

## 범위

- 포함: PRD §5.6 필수 6종 생성, 최신 100건 목록, 전체 미읽음 수, 개별/전체 읽음,
  수신자별 중복 방지, 재전달 가능한 서버 포트, 인터랙티브 HTML·React·Mock·회귀 테스트.
- 제외: 이메일/SMS/푸시, 실시간 소켓, 삭제·100건 이전 탐색, 선택 알림 7종의 생성 트리거,
  `REVIEW_CREATED` 평점 캐시 갱신, 다른 기능의 상태 변경/수신자 조회, 운영 outbox·scheduler,
  `app/`·공유 API·DB 스키마 변경 및 배포.
- 근거: `docs/domain/reference/prd-v6.4.md` §2.3·§5.6·§5.7·D13,
  `docs/domain/erd.md` notifications, `docs/naming-convention.md` §10.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

`notifications`: `id` varchar(30), `recipient_id` varchar(30) users 참조,
`type` notification_type, `title` varchar(100), `body` varchar(500), `link_url` text,
`resource_type` varchar(30) nullable, `resource_id` varchar(30) nullable (FK 없음),
`dedupe_key` varchar(120) unique, `read_at` timestamptz nullable, `created_at` timestamptz.
원본 프로젝트 삭제 시에도 알림 기록은 유지한다. 별도 테이블은 추가하지 않는다.

## 규칙

1. 인증된 활성 사용자는 본인 알림만 조회·읽음 처리한다. 인증 없음은 401이며, 공개 요청의
   recipientId/userId로 인증 주체를 바꿀 수 없다. 다른 사람의 알림과 없는 알림은 동일한 404다.
2. 목록은 `createdAt DESC, id DESC`로 최대 100건을 반환한다. `unreadCount`는 100건 밖을
   포함한 본인의 전체 미읽음 수다. 목록 조회만으로 읽음 처리하지 않는다.
3. 개별 읽음은 본인 알림의 `readAt`이 null인 경우에만 서버 시각으로 변경한다.
   반복 호출은 성공하며 최초 readAt을 보존한다. 변경 항목과 최신 미읽음 수를 반환한다.
4. 전체 읽음은 실행 시점의 본인 미읽음 전체(100건 밖 포함)를 원자적으로 변경한다.
   이미 읽은 시각을 보존하고, 완료 이후 들어온 알림은 미읽음으로 남긴다. 삭제하지 않는다.
5. `APPLICATION_SUBMITTED`는 이벤트의 clientId 1명에게 생성한다.
6. `APPLICATION_ACCEPTED`는 이벤트의 선정된 freelancerId 1명에게 생성한다.
7. `APPLICATION_REJECTED`는 직접 거절된 freelancerId 1명에게 생성한다.
8. `APPLICATION_AUTO_REJECTED`는 다른 지원자 선정으로 미선정된 freelancerId 1명에게
   생성한다. 마감·취소로 발생한 상태 변경을 이 종류로 중복 발송하지 않는다.
9. `PROJECT_RECRUITMENT_CLOSED`는 원천 도메인이 전달한 마감 수신자 스냅샷에 생성한다.
   `closureEventId`가 필수다. §2.3의 PENDING 기준을 잠정 적용하되 §5.6의 지원자 전원과의
   차이는 CR-0001로 확인한다. notifications가 현재 지원 상태를 재조회해 대상을 바꾸지 않는다.
10. `PROJECT_CANCELED`는 취소 시점 대기 지원자와 선정 프리랜서의 합집합에 생성한다.
    선정자가 없을 수 있으며 중복 수신자는 한 번만 받는다. closureEventId 필수다.
11. 같은 사건·종류·수신자는 동시에 재전달해도 1건이다. 안정적인 eventId(마감/취소는
    closureEventId), 종류, 수신자를 해시해 최대 120자 dedupeKey를 만들고 저장소 unique로
    보장한다. 같은 프로젝트의 다른 모집 회차는 별도 closureEventId를 사용한다.
12. 서버 생성 문구와 허용된 내부 프로젝트 경로만 저장한다. public 생성 API는 없다.
    내부 입력의 ID·타입·시각·문자열을 검증하고 title/body 길이 제한을 준수한다.
    알림 DTO에 recipientId·dedupeKey 등 내부 필드를 노출하지 않는다.
13. 안전 전달 포트는 저장 실패를 본 작업으로 throw하지 않고 retry_required 결과로 보고한다.
    호출자는 성공한 도메인 작업을 롤백하지 않으며 같은 이벤트/수신자 스냅샷을 재전달한다.
    일부 저장 후 실패해도 재시도 시 기존 알림을 중복 생성하지 않는다. Mock은 휘발성이며
    프로세스 장애·전달 전 유실 복구는 보장하지 않는다(운영 outbox 통합 필수).
14. enum 정본 13값을 유지하되 이번 생성 포트는 필수 6종만 허용한다.
    REVIEW_CREATED 및 비정본 별칭은 생성 요청에서 거부한다.
15. 화면은 전체/안 읽음(최근 100건 내) 필터, 전체 미읽음 배지, 개별·전체 읽음,
    프로젝트 보기, 절대 발생 시각을 제공한다. 목록 상한과 전체 읽음 범위를 문구로 밝힌다.
16. 로딩·빈 목록·미읽음 없음·실패/재시도·세션 만료를 구분한다. 요청 중 중복 조작을
    차단하고 실패 시 확인된 데이터를 보존하되, 401/계정 변경 시 이전 계정 데이터를 즉시
    숨긴다. 늦은 이전 요청이 새 계정 상태를 덮어쓰지 않는다.
17. 실제 버튼·링크, 읽음 텍스트, 포커스 표시, live 상태 안내를 사용한다.
    320px 폭에서 주요 조작을 유지하고 reduced-motion을 지원한다.
18. 마감 알림은 조회 여부와 무관하게 10분 이내 생성해야 한다. 담당 포트는 전달 결과만
    제공한다. 능동 scheduler, durable retry, 성공 이후 deadlineNotifiedAt 기록은 원천 도메인과
    팀장 통합 책임이며 본 기능 Mock만으로 운영 SLA 통과를 주장하지 않는다.

## 비고

API는 팀장 통합 전 작업 가설이다. 미확정 수신자 정책·공유 담당표 변경·연결 접점은
`change-requests/CR-0001-notifications-integration.md`에 기록한다.
디자인은 새 기능이므로 기존 화면 재설계 프롬프트의 후보 승인 단계 대상이 아니다.
공통 browse 레퍼런스·디자인 토큰·UX 원칙을 적용하며 기존 타 기능 화면은 바꾸지 않는다.
