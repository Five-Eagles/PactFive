import type { PrismaClient } from '../../generated/prisma/client';
import type {
  ClientProfileCompletionRow,
  FreelancerProfileCompletionRow,
  ProfileCompletionRepository,
  ProfileCompletionSnapshot,
} from './profile-completion.repository';

/**
 * ProfileCompletionRepository의 Prisma(Supabase Postgres) 구현 — 2026-09-09, PR #89(오민혁)
 * 통합. `findProfileCompletionSnapshot`은 사용자·역할별 본인 프로필·연결 기술을 단일
 * `findUnique` + nested select로 읽는다 — Prisma가 이를 한 SQL 질의(JOIN)로 내리므로 별도
 * `$transaction` 없이도 일관된 snapshot이다.
 *
 * 2026-09-09 RW 결정 — 이 저장소·`createProfileCompletionPort`는 이식만 하고 express-app.ts
 * 조립 지점에 아직 주입하지 않는다(applications 지원 게이트 미연결). 이유는
 * profile-completion.port.ts 헤더 주석과 feedback_loop/2026-09-09/user-management.md 참고 —
 * app/web에 프로필 입력·수정 화면이 없어 지금 게이트를 켜면 모든 프리랜서 지원이 막힌다.
 */
export class PrismaProfileCompletionRepository implements ProfileCompletionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProfileCompletionSnapshot(userId: string): Promise<ProfileCompletionSnapshot | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        deletedAt: true,
        clientProfile: {
          select: {
            userId: true,
            companyName: true,
            businessField: true,
            businessFieldEtc: true,
            completedAt: true,
          },
        },
        freelancerProfile: {
          select: {
            userId: true,
            primaryCategory: true,
            careerYears: true,
            completedAt: true,
            freelancerSkills: {
              select: {
                skillId: true,
                skill: { select: { isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!user) return null;
    const deletedAt = user.deletedAt ? user.deletedAt.toISOString() : null;

    if (user.role === 'CLIENT') {
      const profile: ClientProfileCompletionRow | null = user.clientProfile
        ? {
            userId: user.clientProfile.userId,
            companyName: user.clientProfile.companyName,
            businessField: user.clientProfile.businessField,
            businessFieldEtc: user.clientProfile.businessFieldEtc,
            completedAt: user.clientProfile.completedAt ? user.clientProfile.completedAt.toISOString() : null,
          }
        : null;
      return { userId: user.id, deletedAt, role: 'CLIENT', profile };
    }

    if (user.role === 'FREELANCER') {
      const profile: FreelancerProfileCompletionRow | null = user.freelancerProfile
        ? {
            userId: user.freelancerProfile.userId,
            primaryCategory: user.freelancerProfile.primaryCategory,
            careerYears: user.freelancerProfile.careerYears,
            skills: user.freelancerProfile.freelancerSkills.map((row) => ({
              skillId: row.skillId,
              isActive: row.skill.isActive,
            })),
            completedAt: user.freelancerProfile.completedAt
              ? user.freelancerProfile.completedAt.toISOString()
              : null,
          }
        : null;
      return { userId: user.id, deletedAt, role: 'FREELANCER', profile };
    }

    // CLIENT|FREELANCER 외 역할은 없다(UserRole enum) — 방어적으로 UNAVAILABLE 경로로 보낸다.
    return null;
  }
}
