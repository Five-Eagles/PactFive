import type {
  ApplicationRepository,
  ClosureReason,
  RejectPendingApplicationsResult,
} from './application.types';

/**
 * project-management가 호출하는 포트(`ApplicationsPort.rejectPendingApplications`,
 * project.port.ts) 구현 — 반대 방향 delegate다. 모집 마감·프로젝트 취소 시 대기 지원을
 * 일괄 거절한다(규칙 8·23·29). 지금까지는 `createUnavailableApplicationsPort()`가 항상
 * `FAILED`를 돌려주는 자리표시자였다 — applications가 app/에 붙은 오늘부터 실제로 처리한다
 * (in-memory-external.adapter.ts 교체).
 *
 * 원본: features/applications/prototype/server/application.service.ts의
 * `rejectPendingApplications`. project 조회 없이 바로 처리한다 — 이 포트는
 * project-management가 이미 존재를 확인한 뒤에만 부르는 내부 호출이라, 여기서 다시
 * `PROJECT_NOT_FOUND`를 확인하지 않는다(원본의 `requireProject` 생략).
 */
export function createApplicationsPortAdapter(
  repository: ApplicationRepository,
  notifications: { publish(event: { type: string; projectId: string; applicationId: string; occurredAt: string }): Promise<void> },
) {
  return {
    async rejectPendingApplications(
      projectId: string,
      input: { closureEventId: string; reason: ClosureReason; occurredAt: string },
    ): Promise<RejectPendingApplicationsResult> {
      const cached = repository.getClosure(input.closureEventId);
      if (cached) return { ...cached, alreadyProcessed: true };

      const pending = repository.getByProject(projectId).filter((row) => row.status === 'PENDING');
      if (pending.length === 0) {
        const none: RejectPendingApplicationsResult = {
          rejectedCount: 0,
          alreadyProcessed: false,
          result: 'NOT_NEEDED',
        };
        repository.setClosure(input.closureEventId, none);
        return none;
      }

      // 원본 그대로 — reason과 무관하게 rejectionType은 AUTO_RECRUITMENT_CLOSED로 고정한다.
      // api-contract.md "내부 — rejectPendingApplications" 절은 PROJECT_CANCELED의 거절
      // 사유가 "취소 알림용"이라고만 적어뒀고, 저장 rejectionType 자체를 나누라고 하지 않는다.
      for (const row of pending) {
        repository.saveApplication({
          ...row,
          status: 'REJECTED',
          rejectionType: 'AUTO_RECRUITMENT_CLOSED',
          decidedAt: input.occurredAt,
        });
        try {
          await notifications.publish({
            type: 'APPLICATION_AUTO_REJECTED',
            projectId,
            applicationId: row.applicationId,
            occurredAt: input.occurredAt,
          });
        } catch {
          // 발행 실패가 마감·취소 자체를 되돌리지 않는다 (규칙 23).
        }
      }

      const done: RejectPendingApplicationsResult = {
        rejectedCount: pending.length,
        alreadyProcessed: false,
        result: 'DONE',
      };
      repository.setClosure(input.closureEventId, done);
      return done;
    },
  };
}
