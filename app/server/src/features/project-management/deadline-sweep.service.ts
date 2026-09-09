import type { ProjectRepository } from './project.repository';
import type { AuthContext } from './project.port';
import { effectiveRecruitmentStatus } from './recruitment-status';

/**
 * 마감일이 지난 프로젝트를 찾아 실제로 마감 처리한다 (notifications CR-0001 §4).
 *
 * ## 왜 필요한가
 *
 * 지금은 **누가 그 프로젝트를 열어봐야** 마감으로 보인다. 규칙 14 가 조회 시점에
 * 상태를 보정하기 때문이다. 화면상으로는 맞지만 **아무 일도 일어나지 않는다** —
 * 대기 지원이 거절되지도, 알림이 나가지도 않는다. 아무도 안 보면 영원히 그대로다.
 *
 * 그래서 사용자 조회와 무관하게 **스스로 도는 것**이 필요하다.
 *
 * ## 이 파일이 하지 않는 것 — 언제 도는가
 *
 * **여기에 타이머를 두지 않는다.** 서버가 Vercel 에 요청이 올 때만 깨어나는 형태로
 * 올라가 있어서, 프로세스 안에 `setInterval` 을 두면 **로컬에서만 돌고 배포하면
 * 조용히 안 돈다.** 에러도 안 난다 — 알림이 안 갈 뿐이다. 가장 나쁜 형태의 실패다.
 *
 * 그래서 이 파일은 **부르면 한 번 도는 함수**만 제공하고, 언제 부를지는 밖에서 정한다.
 * `/internal/v1/projects/sweep-deadlines` 로 열려 있으며 서비스 토큰이 필요하다.
 * 실제 트리거(Vercel Cron 등)는 배포 설정이라 팀장 영역이다 — 2026-09-09 회의 안건.
 *
 * ## 안전하게 여러 번 불러도 되는가
 *
 * 된다. 마감 처리(`closeRecruitment`)가 이미 멱등이다 — 규칙 24 로 이미 CLOSED 면
 * 아무것도 바꾸지 않고 성공으로 돌려준다. 그래서 두 번 돌아도 알림이 두 번 가지 않는다.
 */

export type DeadlineSweepResult = {
  /** 훑어본 살아 있는 프로젝트 수 */
  scanned: number;
  /** 마감 시각이 지났는데 아직 CLOSED 가 아니던 것 */
  due: number;
  /** 실제로 마감 처리에 성공한 것 */
  closed: number;
  /** 마감은 됐고 그 과정에서 거절된 대기 지원 총합 */
  rejectedApplications: number;
  /** 실패한 것 — 하나가 실패해도 나머지는 계속 처리한다 */
  failed: { projectId: string; reason: string }[];
};

/** 마감 처리를 실제로 수행하는 쪽. `project.service.ts` 의 `closeRecruitment` 가 들어온다 */
export type CloseRecruitmentDelegate = {
  closeRecruitment(
    auth: AuthContext | null,
    projectId: string,
  ): Promise<{ status: number; body: unknown }>;
};

export type DeadlineSweepDeps = {
  repo: ProjectRepository;
  closer: CloseRecruitmentDelegate;
  now: () => string;
};

export function createDeadlineSweepService(deps: DeadlineSweepDeps) {
  const { repo, closer, now } = deps;

  async function sweepDeadlines(): Promise<DeadlineSweepResult> {
    const at = now();
    const all = await repo.findAll();

    // 조회 시점 기준으로 CLOSED 인데 저장값은 아직 아닌 것 = 마감이 밀린 것.
    // 규칙 14 판정을 그대로 쓴다 — 화면이 보는 것과 같은 기준이어야 한다.
    const due = all.filter(
      (p) => p.recruitmentStatus !== 'CLOSED' && effectiveRecruitmentStatus(p, at) === 'CLOSED',
    );

    const result: DeadlineSweepResult = {
      scanned: all.length,
      due: due.length,
      closed: 0,
      rejectedApplications: 0,
      failed: [],
    };

    for (const project of due) {
      try {
        // 마감의 주체는 **의뢰인 본인**이다. 서비스가 대신 누르는 것이지
        // 다른 사람이 남의 프로젝트를 마감하는 게 아니다.
        // 소유자 확인 경로를 서비스용으로 우회해 열지 않는다 (CR-0001 §4).
        const res = await closer.closeRecruitment(
          { userId: project.clientId, role: 'CLIENT' },
          project.projectId,
        );
        if (res.status >= 400) {
          result.failed.push({ projectId: project.projectId, reason: `status ${res.status}` });
          continue;
        }
        result.closed += 1;
        const body = res.body as { rejectedApplicationCount?: number } | null;
        result.rejectedApplications += body?.rejectedApplicationCount ?? 0;
      } catch (error) {
        // 하나가 실패해도 나머지는 계속 처리한다. 한 건 때문에 전체가 멈추면
        // 다음 실행 때까지 아무것도 마감되지 않는다.
        result.failed.push({
          projectId: project.projectId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  return { sweepDeadlines };
}
