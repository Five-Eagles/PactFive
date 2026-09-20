# applications — 2026-09-20 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| develop merge | 현황판 충돌 정리 후 완료 |
| `npx tsx features/applications/prototype/run.tsx` | **PASS 97 / FAIL 0** |
| API 스모크 (`applications-api-smoke.json`) | **6 PASS / 0 FAIL** |

### API 스모크

| 케이스 | 결과 |
|---|---|
| recruiting OPEN · counts ≥1 | PASS (`ac=1` pending=`1`) |
| 의뢰인 지원 목록 | PASS items=1 |
| CLIENT 지원 POST | PASS **403** |
| 프리랜서 `/applications/me` | PASS |
| eligibility | PASS `canApply=false`(이미 지원) · `profileCompletion=null` |
| CLOSED 누적 건수 ≥1 | PASS |

## 2. 관찰

- **A-02 / 프로필 게이트**: ProfilePage는 develop에 있으나 applications eligibility의
  `profileCompletion`은 여전히 **null** — 차단 모드 미배선(ADR-0014). **켜지 않음.**
- **R-001** `$transaction`: ADR-0015 backlog 유지. 시드 가드·bump 전파는 9/11 조치로
  스모크 안정.

## 3. 잔여

| ID | 내용 | 제안 |
|---|---|---|
| **R-001** | INSERT+bump 단일 `$transaction` | 팀장 backlog |
| **A-02** | 프로필 게이트 차단 | 화면 E2E 후 ADR |
