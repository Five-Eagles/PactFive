import type { ProfileCompletionRepository, ProfileCompletionSnapshot } from "../server/profile-completion.repository";

/** 명시적으로 seed한 계정만 조회한다. 알 수 없는 계정을 완성 상태로 만드는 기본값은 없다. */
export class InMemoryProfileCompletionRepository implements ProfileCompletionRepository {
  private readonly snapshots = new Map<string, ProfileCompletionSnapshot>();

  constructor(snapshots: readonly ProfileCompletionSnapshot[] = []) {
    for (const snapshot of snapshots) this.seedSnapshot(snapshot);
  }

  seedSnapshot(snapshot: ProfileCompletionSnapshot): void {
    this.snapshots.set(snapshot.userId, structuredClone(snapshot));
  }

  async findProfileCompletionSnapshot(userId: string): Promise<ProfileCompletionSnapshot | null> {
    const snapshot = this.snapshots.get(userId);
    return snapshot ? structuredClone(snapshot) : null;
  }
}
