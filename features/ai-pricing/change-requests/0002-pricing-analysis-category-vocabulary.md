---
title: "AI 분석과 프로젝트가 공유할 단일 카테고리 vocabulary 확정"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/prd-v6.4.md, docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing, project-management, user-management]
---

# 스펙 변경 신청

ID: `CR-AP-002`

## 배경 (왜 필요한가)

AI 분석 입력의 `category`는 나중에 프로젝트 등록 입력과 정확히 같아야 한다. 서로 다른 코드를 쓰면
분석은 성공했지만 프로젝트 등록이 422로 실패하거나, 임의 매핑으로 다른 분야의 견적이 저장된다.

## 현재 스펙

PRD v6.4 §8.1과 ERD v1.4 `project_category`는 다음 6종을 정본으로 적는다.

```text
WEB_DEVELOPMENT, APP_DEVELOPMENT, DESIGN, MARKETING, PLANNING, ETC
```

반면 현재 project-management 서버와 2026-09-04 통합 피드백은 다음 6종을 실제 validator 값으로
사용한다.

```text
WEB_DEVELOPMENT, MOBILE_APP, DESIGN, DATA_AI, PLANNING, MARKETING
```

즉 `APP_DEVELOPMENT ↔ MOBILE_APP` 이름 차이뿐 아니라 정본의 `ETC`와 런타임의 `DATA_AI`가 서로
대체돼 의미도 다르다. UI 레퍼런스의 10종을 6종으로 매핑하는 과정도 별도 기록에 남아 있다.

## 제안하는 변경

1. 팀이 6개 코드와 표시명을 한 번 결정하고 PRD, ERD, server validator, seed, UI, user profile,
   ai-pricing을 같은 release에서 맞춘다.
2. 우선안은 이미 `DECIDED`로 기록된 PRD/ERD 목록을 유지하고 런타임을
   `APP_DEVELOPMENT`·`ETC`로 migration하는 것이다. `DATA_AI`가 제품 요구라면 조용히 `ETC`로
   바꾸지 말고 6종 구성 자체를 새 결정으로 승인한다.
3. 코드는 각 feature에 문자열 배열을 복제하지 않고 공통 `ProjectCategory` 타입/validator와
   표시명 map을 단일 모듈에서 import한다.
4. DB/API migration 기간이 필요하면 old→new alias는 요청 adapter에서만 한시 허용하고, 저장값과
   공개 응답은 한 canonical code만 사용한다. 종료일과 데이터 migration을 함께 정한다.

승인 전 feature 프로토타입은 타 담당자 원본을 직접 수정하지 않고, 현재 런타임 6종을 ai-pricing의
단일 validator 한 곳에만 임시 고정한다. 운영 통합에서는 이 임시 상수를 제거하고 배포 대상
project-management와 같은 공유 validator를 사용한다. 이 가설은 문서 불일치를 해결하지 않으므로
production release 블로커다.

## 영향 범위

- 프로젝트 등록·수정·검색 query와 seed data
- AI 분석 입력 snapshot/fingerprint 및 프로젝트 등록 handoff
- client/freelancer profile의 공유 분야 값
- 메인 페이지 카테고리 링크와 표시명
- 기존 저장 데이터 migration, API/E2E fixture

## 대안으로 검토했던 것

- ai-pricing에서 두 목록을 모두 허용: 같은 필드에 8개 의미가 섞이고 프로젝트 handoff가 불안정하다.
- AI 도메인에 매핑 테이블을 둠: 공통 enum이어야 한다는 D-63을 깨며 누락 시 조용히 오분류된다.
- 모든 값을 자유 문자열로 받음: 필터·추천·DB enum 계약을 무효화한다.

## 승인에 필요한 결정

- 최종 6개 코드/표시명
- 기존 `MOBILE_APP`/`DATA_AI` 데이터의 migration 대상
- alias 허용 여부와 제거일
- 공통 타입/validator 소유 위치와 담당자
