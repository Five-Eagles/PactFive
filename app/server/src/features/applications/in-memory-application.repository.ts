import type {
  ApplicationRepository,
  ApplicationRow,
  RejectPendingApplicationsResult,
} from './application.types';

/**
 * 원본: features/applications/prototype/mock/application.mock.ts의 `createMemoryStore` 중
 * 지원 행·멱등·closure 부분만 옮겼다 — 프로젝트 컨텍스트는 `ProjectApplicationContextPort`가
 * project-management에서 직접 읽으므로 여기서 복제하지 않는다.
 *
 * Prisma 도입 전까지 in-memory (다른 기능들과 같은 원칙 — app/server/AGENTS.md).
 */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications: ApplicationRow[] = [];
  private readonly idempotency = new Map<string, { bodyHash: string; applicationId: string }>();
  private readonly closures = new Map<string, RejectPendingApplicationsResult>();
  private seq = 100;

  getApplication(applicationId: string): ApplicationRow | undefined {
    const row = this.applications.find((item) => item.applicationId === applicationId);
    return row ? { ...row } : undefined;
  }

  getByProject(projectId: string): ApplicationRow[] {
    return this.applications.filter((item) => item.projectId === projectId).map((row) => ({ ...row }));
  }

  getByFreelancer(freelancerId: string): ApplicationRow[] {
    return this.applications
      .filter((item) => item.freelancerId === freelancerId)
      .map((row) => ({ ...row }));
  }

  findByProjectFreelancer(projectId: string, freelancerId: string): ApplicationRow | undefined {
    const row = this.applications.find(
      (item) => item.projectId === projectId && item.freelancerId === freelancerId,
    );
    return row ? { ...row } : undefined;
  }

  insertApplication(row: ApplicationRow): void {
    this.applications.push({ ...row });
  }

  saveApplication(row: ApplicationRow): void {
    const index = this.applications.findIndex((item) => item.applicationId === row.applicationId);
    if (index >= 0) this.applications[index] = { ...row };
    else this.applications.push({ ...row });
  }

  getIdempotency(key: string): { bodyHash: string; applicationId: string } | undefined {
    const cached = this.idempotency.get(key);
    return cached ? { ...cached } : undefined;
  }

  setIdempotency(key: string, bodyHash: string, applicationId: string): void {
    this.idempotency.set(key, { bodyHash, applicationId });
  }

  getClosure(closureEventId: string): RejectPendingApplicationsResult | undefined {
    const cached = this.closures.get(closureEventId);
    return cached ? { ...cached } : undefined;
  }

  setClosure(closureEventId: string, result: RejectPendingApplicationsResult): void {
    this.closures.set(closureEventId, { ...result });
  }

  nextApplicationId(): string {
    this.seq += 1;
    return `app_${this.seq}`;
  }
}
