---
title: "리뷰 태그 10종을 상호 리뷰 설계서 v2.0 코드로 맞춘다"
status: "반영중"
requested_by: "조준영 (reviews)"
date: "2026-09-07"
updated: "2026-09-09"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [reviews]
---

# 스펙 변경 신청

ID: `CR-RV-001`
상태: 반영중 (ERD 2026-09-08 반영 완료. `app/` 미반영)

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

## 진행 상황 (2026-09-09 갱신)

**반영된 것.** ERD는 2026-09-08 통합에서 들어갔습니다 — `docs/domain/erd.md:624~645`(E-38),
`erd-v1.4.dbml:268~286`. 신 코드 10종이 정본에 있습니다.

**남은 것 (팀장 `app/` 이식).** `app/`은 아직 구 E-19 코드입니다 —
`app/server/src/features/reviews/review.constants.ts:6~20`,
`app/web/src/features/reviews/ReviewPage.tsx:28~38`의 `TAG_LABEL`. ERD와 `app/`이 서로 다른
코드를 쓰는 상태이며, `features/reviews/review/teamlead-port-instructions-2026-09-09.md` §1의
1번 항목으로 교체 방법을 적어 두었습니다.

**한글 라벨.** ERD `:638~640`의 「`features/reviews/` 어디에도 한글 라벨이 없다」는 가정은
사실과 다릅니다 — `prototype/web/review.view-model.ts:61~75`에 10종이 있습니다. 화면 문구라
`web/` 아래에 둔 것입니다. 방향별 전문은 지시서 §1-2 표에 있고,
`feedback_loop/2026-09-08/reviews.md`로 회신했습니다.

`PROFESSIONAL_ATTITUDE`는 양방향 코드가 같지만 **라벨이 다릅니다**(「업무 태도」/「협업 태도」).
`app/web`처럼 코드 하나에 라벨 하나를 매핑하는 구조로는 구분되지 않으니 방향별로 골라야
합니다.

## 대안으로 검토했던 것

E-19를 유지하고 설계서 태그를 표시명만 쓰는 안. 설계서 v2.0을 구현 기준으로 쓰기로 해 기각했다.
`docs/domain/`은 담당자가 직접 고치지 않으므로 이 신청으로만 남긴다.
