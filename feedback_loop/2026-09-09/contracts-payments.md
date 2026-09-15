# 2026-09-09 — contracts-payments 1~2단계 + 계약무효화 배선 (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 5번째 단위.
근거: `features/contracts-payments/review/teamlead-port-instructions-2026-09-09.md`
(조준영, 원격 브랜치 `origin/feature/contracts-payments`에만 있다 — 로컬 미병합).
우선순위 1·2·5번을 반영했다(3·4번은 #201로 이관, 지시서 자체가 "3번은 복구 경로, 4번은
멱등 정확도"로 우선순위를 낮게 매겨 뒀다).

## 무엇을 했나

### §1 — 납품 파일 정보가 항상 `delivery.zip`·0 bytes였던 결함

`PrepareDeliveryUploadInput`은 이미 `fileName`·`contentType`·`size`를 선언하고 있었는데
(`public-api.types.ts`) `prepareDeliveryUpload` 구현이 `sha256`만 검증하고 나머지 3개는
받지도 저장하지도 않았다. `requestDelivery`의 `??` fallback이 그래서 항상 걸렸다.

- `prepareDeliveryUpload`에 원본(`prototype/mock/public-api.mock.ts:1365~1392`)과 같은 검증을
  붙였다 — `fileName`·`contentType` 빈 값이면 `VALIDATION_ERROR`, `size`가 0 이하거나
  `MAX_DELIVERY_FILE_BYTES`(100MB, 원본과 같은 값) 초과면 `VALIDATION_ERROR`, `sha256`은
  기존과 같은 64자 hex 검증.
- 검증 통과 시 `fileName`·`mimeType`·`sizeBytes`·`fileSha256`을 delivery 행에 저장한다.
  `DeliveryRow`에 `fileSha256` 필드를 추가했다 — `schema.prisma`의 `file_sha256` 컬럼이
  지금까지 한 번도 쓰이지 않았던 것(지시서가 지적한 부분)을 여기서 처음 채운다.
- `requestDelivery`의 `??` fallback 3줄(`delivery.zip`·`application/octet-stream`·`0`)을
  제거했다 — 값이 `prepareDeliveryUpload` 시점에 이미 정해진다.
- `PrismaContractsPaymentsRepository`의 `saveDelivery`/`toDeliveryRow`에 `fileSha256`
  매핑을 추가했다(기존에 빠져 있었다 — 추가하지 않으면 인메모리에선 동작해도 Prisma
  백엔드에서는 저장·조회가 안 된다).
- 웹은 이미 `fileName`·`contentType`·`size`·`sha256`을 전부 보내고 있었다
  (`DeliveryPage.tsx`) — 서버가 받는 값을 버리고 있었을 뿐이라 웹 쪽 변경은 없다.

### §2 — 「다운로드」 404

`assembleDeliveryResponse`가 만드는 `downloadUrl`이 `public-api.routes.ts`에 등록된 적 없는
`/delivery/download` 경로를 가리키고 있었다. 조준영이 권고한 두 번째 안(라우트를 새로 만들지
않고 `downloadUrl`을 `null`로 둔다)을 그대로 반영했다 — 실저장소가 spec.md 규칙 23으로 이번
Increment 밖에 있어 리다이렉트할 대상이 없다.

- `downloadUrl: null` 고정, `canDownload: false` 고정.
- 웹 `DeliveryPanel.tsx`는 원래도 `downloadUrl ? <Button>...</Button> : null` 형태로
  버튼을 조건부 렌더링하고 있어서(`canDownload` 필드 자체를 참조하지 않는다) 이 변경만으로
  버튼이 자동으로 숨겨진다 — 웹 쪽 변경은 없다.

### §5 — 프로젝트 취소가 계약 무효화까지 가지 않던 문제

`in-memory-external.adapter.ts`의 `createUnavailableContractsPort`가 무조건 `FAILED`를
반환하고 있었다. 조준영 쪽 `invalidateAgreement` 인바운드 로직(`public-api.service.ts`)은
이미 완성돼 있었고 인바운드 라우트도 열려 있었다(`public-api.routes.ts:83`) — 배선만
빠져 있었다.

- `project-management/contracts-payments.adapter.ts` 신설 — `contracts-payments/
  project-management.adapter.ts`(반대 방향)와 같은 패턴. 기능 폴더 간 직접 import 없이
  `ContractsPaymentsDelegate` 구조 타입으로 express-app.ts가 실제 구현을 끼운다.
- `express-app.ts`에서 `publicApiService`가 준비된 뒤 `projectPorts.contracts =
  createContractsPaymentsAdapter(publicApiService)`로 교체했다. `projectPorts`는
  `project.service.ts`가 참조로 붙잡고 있어(기존 `.pricing`·`.applications`와 같은 패턴)
  늦게 채워도 이후 모든 취소 요청이 실제 구현을 탄다.
- `invalidateAgreement`의 `requestId`·`idempotencyKey`는 실제 멱등 로직에 관여하지 않는
  형식상 필드라(그 함수는 `cancellationId`만으로 멱등을 판정한다) `cancellationId`에서
  파생해 채웠다.
- **호출 실패는 던지지 않고 `FAILED`로 낮춘다.** `project.service.ts`의 취소 처리는 이
  호출을 try/catch로 감싸지 않는다 — 규칙 29(하나라도 실패하면 202, 취소 자체는 되돌리지
  않는다)를 지키려면 예외가 아니라 정직한 실패 응답이어야 한다.

### 문서

- `docs/domain/erd.md`·`erd-v1.4.dbml`의 `file_sha256` 주석을 "조준영 확인 필요(Assumption)"
  에서 "확인 완료(Fact) — 이식 지시서 §1이 채우도록 요청, 실제로 저장한다"로 갱신했다.
  `requested_by`는 이번 범위 밖이라 그대로 뒀다.

### 안 한 것 (의도적, #201로 이관)

- §3 `retrievePayment` 복구 호출부, §4 `approveDelivery`/`invalidateAgreement` 멱등 본문
  비교 — 지시서 자체가 "3번은 복구 경로, 4번은 멱등 정확도"로 1·2번보다 우선순위를 낮게
  매겨 뒀다. #201에서 CR-CP-002의 `body_hash` 테이블과 함께 처리한다(지시서 §4 권고).

## 담당자별 영향·후속 조치

**조준영 (contracts-payments)** — 영향 없음, 후속 조치 없음. 본인이 쓴 지시서 §1·2·5를
그대로 반영했다. §2에서 권고한 두 안 중 두 번째(`downloadUrl: null`)를 그대로 채택했다.

**유동우 (project-management)** — 영향 있음, 확인 필요. `express-app.ts`에서
`projectPorts.contracts`를 늦게 교체하는 배선을 추가했다 — `project.service.ts`의
`cancelProject` 로직 자체는 건드리지 않았지만, 지금까지 항상 `FAILED`만 보던
`ports.contracts.invalidateAgreementAndContract` 호출이 이제 실제로 `DONE`/`NOT_NEEDED`를
반환할 수 있다. `postActions.contractInvalidation`이 실패가 아니라 성공으로 바뀌는 것 자체는
버그 수정이지만, 이 필드를 소비하는 웹 화면(취소 조회)이 `FAILED`를 전제로 만든 문구가
있다면 확인이 필요하다 — grep으로는 화면 쪽에서 `contractInvalidation` 값별 분기 문구를
찾지 못했다(전부 `postActions` 객체를 그대로 보여주거나 `anyFailed` 여부만 본다), 하지만
직접 확인은 권장한다.

**최윤석 (applications)** — 영향 없음. `rejectPendingApplications` 경로는 건드리지 않았다.

## 검증

- `app/server`, `app/web` tsc 통과
- `app/web` vite build 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과
- contracts-payments 전용 자동 테스트는 리포에 없다(기존에도 없었다) — 수동 경로 점검은
  다음 QA 사이클(시드 계정 기반)에서 한다.
