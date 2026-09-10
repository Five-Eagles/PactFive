import type { ApplicationNotificationEvent, ApplicationNotificationPort, ApplicationRepository, ProjectApplicationContextPort } from './application.types';

type NotificationEvent = {
  eventId: string;
  projectId: string;
  projectTitle: string;
  occurredAt: string;
  applicationId: string;
} & ({
  type: 'APPLICATION_SUBMITTED';
  clientId: string;
} | {
  type: 'APPLICATION_ACCEPTED' | 'APPLICATION_REJECTED' | 'APPLICATION_AUTO_REJECTED';
  freelancerId: string;
});

type NotificationDelivery = {
  deliverNotificationEventSafely(input: NotificationEvent): Promise<{ status: 'delivered' | 'retry_required' }>;
  /* Keep this structural so applications stays independent from notifications' implementation. */
};

/** applications 사건을 notifications의 영속 저장소로 넘기는 app 조립 어댑터. */
export class NotificationApplicationAdapter implements ApplicationNotificationPort {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly projectContext: ProjectApplicationContextPort,
    private readonly delivery: NotificationDelivery,
  ) {}

  async publish(event: ApplicationNotificationEvent): Promise<void> {
    const [row, project] = await Promise.all([
      this.repository.getApplication(event.applicationId),
      this.projectContext.getProjectContext(event.projectId),
    ]);
    if (!row || !project) return;

    const base = {
      eventId: `application:${event.type}:${event.applicationId}`,
      projectId: event.projectId,
      projectTitle: project.title || '프로젝트',
      occurredAt: event.occurredAt,
      applicationId: event.applicationId,
    };
    if (event.type === 'APPLICATION_SUBMITTED') {
      await this.delivery.deliverNotificationEventSafely({ ...base, type: event.type, clientId: project.clientId });
    } else {
      await this.delivery.deliverNotificationEventSafely({ ...base, type: event.type, freelancerId: row.freelancerId });
    }
  }
}
