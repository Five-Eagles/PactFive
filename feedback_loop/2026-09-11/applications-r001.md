# R-001 원인 분석 — 2026-09-11

## ADR-0015 판정 (유지)

지원 행 INSERT와 `bumpApplicationCounts`를 같은 Prisma `$transaction`으로 묶지 않은 것은
**운영 전환 전 app 통합 backlog**다. PRD QA에서는 허용.

## 오늘 스모크에서 본 “drift”의 실제 원인

### 1) recruiting: 행 4 · count 1

| 관찰 | 해석 |
|---|---|
| `uniqueFreelancers = 4` | 동일 이메일이 아니라 **서로 다른 userId** |
| 시드가 Supabase 고아 계정을 지우고 재생성 | 새 `usr_*`로 다시 지원 → unique(project, freelancer) 통과 |
| bump 배선 전/실패 건 | 옛 행은 남고 `applicationCount`는 일부만 반영 |
| 마커 프로젝트가 **CLOSED** | `ensureProject`가 상태 무시하고 재사용 → 모집 QA 오염 |

→ **단일 요청 원자성 실패라기보다 시드 DB 오염 + 재사용 가드 부재.**

### 2) CLOSED 전용: 행 1(REJECTED) · count 0

| 관찰 | 해석 |
|---|---|
| 지원 행은 있음 | POST는 성공했거나 과거 데이터 |
| `applicationCount=0` | bump 미호출·실패 삼킴·또는 배선 전 INSERT |
| 시드 `이미 CLOSED — 재사용` | count=0이어도 영구 재사용 → 스모크 FAIL 고정 |

마감 스윕은 `pendingApplicationCount=0`만 두고 **누적 `applicationCount`는 건드리지 않음**
(`project.service.ts` close 경로). 스윕이 0으로 만든 것이 아니다.

## 오늘 조치

1. **app** `application.service`: bump `try/catch` 제거 — 실패를 삼키지 않음 (지시서 §4와 동일).
   동일 `$transaction` 승격은 아직 안 함(ADR 결정 유지).
2. **seed** `ensureProject(..., { requireOpen })`: CLOSED 마커면 새 OPEN 프로젝트 생성.
3. **seed** `ensureRecruitmentClosed`: CLOSED인데 `applicationCount<1`이면 새 프로젝트로 재구성.

## 남는 일 (팀장 backlog)

- R-001 본령: INSERT+bump 단일 `$transaction`
- 로컬 DB의 orphan 지원 행 정리(선택)
- 알림 items=0 별도 추적
