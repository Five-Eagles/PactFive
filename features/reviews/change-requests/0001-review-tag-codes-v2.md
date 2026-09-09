---
title: "리뷰 태그 10종을 상호 리뷰 설계서 v2.0 코드로 맞춘다"
status: "반영 완료"
requested_by: "조준영 (reviews)"
date: "2026-09-07"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [reviews]
---

# 스펙 변경 신청

ID: `CR-RV-001`

> **닫음 (2026-09-09, 팀장).** `erd-v1.4.dbml` E-38 주석은 이미 새 코드로 돼 있었다(CR 제기
> 당시 함께 반영됨). 남아 있던 것은 `app/server`·`app/web` 이식본이었는데, 오늘
> `feature/teamlead-cr-port-2026-09-09` 브랜치에서 조준영의 이식 지시서(§1-1)대로 교체했다 —
> `review.constants.ts`(서버)·`review.types.ts`(서버·웹) 10종. `docs/domain/erd.md`는 별도
> 태그 설명이 없어(erd.md는 erd-v1.4.dbml을 가리키는 포인터 문서) 추가로 고칠 것이 없었다.

## 배경 (왜 필요한가)

`PactFive_상호_리뷰_평균_별점_설계서` v2.0을 reviews Increment 정본으로 쓰기로 했다.
태그 코드가 ERD E-19(2026-08-20) 10종과 다르다. 기능 폴더 Mock은 설계서 코드를 쓰므로
ERD 주석을 같은 목록으로 바꿔야 프론트·백엔드·스키마가 다시 맞는다.

## 현재 스펙

ERD v1.4 `reviews.tags` E-19:

```text
CLIENT_TO_FREELANCER:
  RESPONSIBILITY, COMMUNICATION, TECHNICAL_SKILL,
  SCHEDULE_COMPLIANCE, DELIVERABLE_QUALITY

FREELANCER_TO_CLIENT:
  REQUIREMENT_CLARITY, COMMUNICATION, FEEDBACK_SPEED,
  SCOPE_STABILITY, PAYMENT_RELIABILITY
```

## 제안하는 변경

방향별 5종을 설계서 §10으로 교체한다. DB enum이 아니라 애플리케이션 코드 목록인 점은 유지한다.

```text
CLIENT_TO_FREELANCER:
  WORK_QUALITY, ON_TIME_DELIVERY, GOOD_COMMUNICATION,
  REQUIREMENT_UNDERSTANDING, PROFESSIONAL_ATTITUDE

FREELANCER_TO_CLIENT:
  CLEAR_REQUIREMENTS, FAST_FEEDBACK, GOOD_COMMUNICATION,
  SCOPE_STABILITY, PROFESSIONAL_ATTITUDE
```

역할과 맞지 않는 태그는 422 `REVIEW_TAG_INVALID`로 거부한다.

## 영향 범위

- `docs/domain/reference/erd-v1.4.dbml` E-19 주석, `docs/domain/erd.md` 태그 설명
- `features/reviews/` spec·api-contract·Mock (이 CR과 같은 브랜치에서 이미 설계서 코드로 맞춤)
- `app/` reviews 이식본은 팀장 다음 통합

## 대안으로 검토했던 것

E-19를 유지하고 설계서 태그를 표시명만 쓰는 안. 설계서 v2.0을 구현 기준으로 쓰기로 해 기각했다.
`docs/domain/`은 담당자가 직접 고치지 않으므로 이 신청으로만 남긴다.
