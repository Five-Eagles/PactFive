import type { ContractsPort, InvalidateAgreementInput, InvalidateAgreementResult } from './project.port';

/**
 * `ContractsPort` 의 실제 구현 연결 — contracts-payments 로 넘긴다.
 *
 * 2026-09-09 팀장 반영(contracts-payments 이식 지시서 §5, 조준영). 지금까지는
 * `in-memory-external.adapter.ts`의 `createUnavailableContractsPort`가 무조건
 * `FAILED`를 반환했다 — 조준영 쪽 `invalidateAgreement` 인바운드 로직은 이미 끝나 있었고
 * (`features/contracts-payments/public-api.service.ts`), 남은 것은 이 배선뿐이었다.
 *
 * ## 왜 HTTP 로 부르지 않나
 *
 * `contracts-payments/project-management.adapter.ts`(반대 방향 호출)와 같은 이유다 — 두
 * 기능이 같은 Express 앱 안에 있다. 조립 지점(`app/server/src/express-app.ts`)이
 * contracts-payments 의 공개 API 서비스를 `delegate` 로 넣어 준다.
 *
 * **contracts-payments 폴더를 import 하지 않는다.** `delegate` 의 모양을 여기서 구조적으로
 * 선언해 두고 express-app.ts 가 실제 구현을 끼운다(기능 폴더 간 직접 import 금지 원칙,
 * ADR-0009와 같은 근거).
 *
 * ## requestId·idempotencyKey
 *
 * contracts-payments 쪽 `InvalidateAgreementInput`은 이 두 필드를 요구하지만(HTTP 인바운드
 * 계약의 일반형), `invalidateAgreement` 구현 자체는 `cancellationId` 하나로 멱등을 판정한다
 * (`public-api.service.ts` "invalidate-${cancellationId}" 키) — `requestId`·`idempotencyKey`는
 * 로직에 관여하지 않는 형식상 값이라 `cancellationId`에서 파생해 채운다.
 *
 * ## 실패 처리
 *
 * 호출부(`project.service.ts` cancelProject)는 이 호출을 try/catch 로 감싸지 않는다 —
 * 규칙 29가 "하나라도 실패하면 202, 취소 자체는 되돌리지 않는다"를 요구하므로, 예외를 그대로
 * 던지면 취소 응답 전체가 500이 되어 그 규칙을 어긴다. 그래서 여기서 예외를 잡아
 * `createUnavailableContractsPort`와 같은 모양(`{ alreadyProcessed: false, result: 'FAILED' }`)
 * 으로 정직하게 낮춘다.
 */
export type ContractsPaymentsDelegate = {
  invalidateAgreement(
    projectId: string,
    input: {
      cancellationId?: string;
      cancellationEventId?: string;
      actorUserId: string;
      reason: 'PROJECT_CANCELED';
      projectCanceledAt?: string;
      requestId: string;
      idempotencyKey: string;
      occurredAt?: string;
    },
  ): Promise<{
    alreadyProcessed: boolean;
    result: 'DONE' | 'NOT_NEEDED' | 'FAILED';
  }>;
};

export function createContractsPaymentsAdapter(delegate: ContractsPaymentsDelegate): ContractsPort {
  return {
    async invalidateAgreementAndContract(
      projectId: string,
      input: InvalidateAgreementInput,
    ): Promise<InvalidateAgreementResult> {
      try {
        const result = await delegate.invalidateAgreement(projectId, {
          cancellationId: input.cancellationId,
          actorUserId: input.actorUserId,
          reason: input.reason,
          projectCanceledAt: input.projectCanceledAt,
          requestId: `req_invalidate_${input.cancellationId}`,
          idempotencyKey: input.cancellationId,
        });
        return { alreadyProcessed: result.alreadyProcessed, result: result.result };
      } catch {
        // createUnavailableContractsPort와 같은 정직한 실패 응답 — 취소 자체는 project.service.ts가
        // 이미 커밋한 뒤이므로 여기서 던지면 안 된다(규칙 29).
        return { alreadyProcessed: false, result: 'FAILED' };
      }
    },
  };
}
