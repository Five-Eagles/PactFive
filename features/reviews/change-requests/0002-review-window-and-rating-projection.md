---
title: "리뷰 창·평점 Projection Mock을 ERD에 올린다"
status: "제안"
requested_by: "조준영 (reviews)"
date: "2026-09-07"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [reviews]
---

# 스펙 변경 신청

ID: `CR-RV-002`

## 배경 (왜 필요한가)

실서비스 구축 검토서 F06·F07·F12. 동시 첫 제출과 평점 덮어쓰기를 Mock에서 막으려면
`review_windows`와 reviews 소유 `user_rating_projections`가 필요하다. ERD는 팀장 반영.

## 현재 스펙

`reviews`만 있다. 공개는 조회 때 계산. `users.rating_average`는 오민혁.

## 제안하는 변경

- `review_windows`: `project_id` UNIQUE, `opened_at`(프로젝트 최초 completedAt),
  `deadline_at` = opened_at+14일, `policy_version`.
- `user_rating_projections`: `user_id` UNIQUE, `rating_sum`, `review_count`, `calculated_at`.
  `users` 직접 UPDATE 없음.

근거: 검토서 F06·F07·F12. `app/`·ERD 원본은 이 CR로만 요청한다.
