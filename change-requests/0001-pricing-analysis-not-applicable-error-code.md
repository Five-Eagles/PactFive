---
title: "오류 코드 PRICING_ANALYSIS_NOT_APPLICABLE 신설"
status: "제안"
requested_by: "유동우 (project-management)"
date: "2026-08-25"
affected_docs: [docs/domain/reference/prd-v6.4.md]
affected_features: [project-management, ai-pricing]
---

# 스펙 변경 신청

## 배경 (왜 필요한가)

`features/project-management/api-contract.md`의 `POST /api/v1/projects`(등록)를 작성하면서, 응답할 오류 코드가 없는 경우를 발견했다.

등록 요청에 `pricingAnalysisId`가 있으면 ai-pricing의 `claimPricingAnalysisForCreatedProject`를 등록 트랜잭션 안에서 호출한다 (PRD D-60·D-67, 2026-08-25 오민혁 회신으로 확정). 이 호출이 실패하면 프로젝트 생성까지 되돌리고 `409`로 응답해야 하는데, **그 상황에 붙일 오류 코드가 PRD §8.3에 없다.**

ai-pricing이 돌려주는 실패 사유는 `PRICING_ANALYSIS_NOT_CLAIMABLE`이지만, 그것은 그쪽 도메인 코드다. 클라이언트에게는 project-management의 오류 코드 체계만 노출해야 한다.

## 현재 스펙

PRD v6.4 §8.3 — project-management · engagement 오류 코드 **24종**. AI 분석 연결 실패에 해당하는 코드는 없다.

PRD v6.4 §5.4 D-60 절은 실패 시 동작만 정하고 코드를 지정하지 않았다.

> 분석이 `APPROVED`가 아니거나 이미 적용됨 | `409` — 프로젝트도 생성되지 않음

## 제안하는 변경

PRD §8.3에 아래 한 줄을 추가한다.

| 코드 | HTTP | 문구 |
|---|---|---|
| `PRICING_ANALYSIS_NOT_APPLICABLE` | 409 | 선택하신 분석 결과를 이 프로젝트에 적용할 수 없습니다. 다시 분석해 주세요. |

**발생처**: `POST /api/v1/projects` (A-01) — `pricingAnalysisId`가 있고 연결에 실패한 경우

**발생 조건** (ai-pricing 회신 기준)

```text
분석이 승인 상태가 아님
이미 다른 프로젝트에 적용됨
요청자와 분석 생성자가 다름
```

세 경우를 하나의 코드로 묶는다. **어느 쪽인지 구분해 알려주면 남의 분석 존재 여부가 드러난다.**

## 영향 범위

| 문서 | 무엇 |
|---|---|
| PRD §8.3 | 오류 코드 24종 → **25종** |
| PRD §13 A-01 | 오류 표에 한 줄 추가 |
| PRD §14.10 | 오류 메시지 문구 1개 추가 (문구 합계 164 → 165) |
| PRD §15.4 | 오류 코드 ↔ 발생처 감사표에 한 줄 |
| `features/project-management/api-contract.md` | **이미 이 코드로 작성함** |

## 대안 검토

| 안 | 판정 |
|---|---|
| ai-pricing 코드를 그대로 노출 | ❌ 도메인 경계를 넘는다. 클라이언트가 남의 도메인 코드를 알게 된다 |
| 기존 `VALIDATION_ERROR`(422) 재사용 | ❌ 입력 형식 문제가 아니라 상태 충돌이다. HTTP 코드도 409가 맞다 |
| 세 실패 사유를 각각 다른 코드로 | ❌ "이미 다른 프로젝트에 적용됨"을 알려주면 남의 분석 존재가 드러난다 |

## 비고

PRD는 유동우가 담당하므로 다음 개정(v6.5)에서 직접 반영한다. 이 문서는 **왜 코드가 하나 늘었는지**를 추적하기 위한 기록이다.
