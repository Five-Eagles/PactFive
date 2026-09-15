import type { PrismaClient } from '../../generated/prisma/client';

export type ProfileData = {
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  companyName?: string | null;
  businessField?: string | null;
  businessFieldEtc?: string | null;
  websiteUrl?: string | null;
  primaryCategory?: string | null;
  careerYears?: number | null;
  hourlyRateAmount?: number | null;
  portfolioUrl?: string | null;
  skills?: string[];
};

export interface ProfileRepository {
  get(userId: string, role: 'CLIENT' | 'FREELANCER'): Promise<ProfileData | null>;
  save(userId: string, role: 'CLIENT' | 'FREELANCER', input: ProfileData): Promise<ProfileData>;
}

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string, role: 'CLIENT' | 'FREELANCER'): Promise<ProfileData | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { clientProfile: true, freelancerProfile: { include: { freelancerSkills: true } } },
    });
    if (!user) return null;
    const base = { name: user.name, profileImageUrl: user.profileImageUrl, bio: user.bio };
    if (role === 'CLIENT') {
      const p = user.clientProfile;
      return { ...base, companyName: p?.companyName ?? null, businessField: p?.businessField ?? null, businessFieldEtc: p?.businessFieldEtc ?? null, websiteUrl: p?.websiteUrl ?? null };
    }
    const p = user.freelancerProfile;
    return { ...base, primaryCategory: p?.primaryCategory ?? null, careerYears: p?.careerYears ?? null, hourlyRateAmount: p?.hourlyRateAmount ?? null, portfolioUrl: p?.portfolioUrl ?? null, skills: p?.freelancerSkills.map((s) => s.skillId) ?? [] };
  }

  async save(userId: string, role: 'CLIENT' | 'FREELANCER', input: ProfileData): Promise<ProfileData> {
    await this.prisma.user.update({ where: { id: userId }, data: { name: input.name, bio: input.bio, profileImageUrl: input.profileImageUrl } });
    if (role === 'CLIENT') {
      await this.prisma.clientProfile.upsert({ where: { userId }, create: { id: `cprof_${userId}`, userId, companyName: input.companyName ?? '', businessField: input.businessField as never, businessFieldEtc: input.businessFieldEtc ?? null, websiteUrl: input.websiteUrl ?? null, completedAt: new Date() }, update: { companyName: input.companyName ?? '', businessField: input.businessField as never, businessFieldEtc: input.businessFieldEtc ?? null, websiteUrl: input.websiteUrl ?? null, completedAt: new Date() } });
    } else {
      const p = await this.prisma.freelancerProfile.upsert({ where: { userId }, create: { id: `fprof_${userId}`, userId, primaryCategory: input.primaryCategory as never, careerYears: input.careerYears ?? 0, hourlyRateAmount: input.hourlyRateAmount ?? null, portfolioUrl: input.portfolioUrl ?? null, completedAt: new Date() }, update: { primaryCategory: input.primaryCategory as never, careerYears: input.careerYears ?? 0, hourlyRateAmount: input.hourlyRateAmount ?? null, portfolioUrl: input.portfolioUrl ?? null, completedAt: new Date() } });
      await this.prisma.freelancerSkill.deleteMany({ where: { freelancerProfileId: p.id } });
      if (input.skills?.length) await this.prisma.freelancerSkill.createMany({ data: input.skills.map((skillId) => ({ freelancerProfileId: p.id, skillId })), skipDuplicates: true });
    }
    return (await this.get(userId, role))!;
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly profiles = new Map<string, ProfileData>();
  constructor(private readonly names: Map<string, string>) {}
  async get(userId: string): Promise<ProfileData | null> { return this.profiles.get(userId) ?? { name: this.names.get(userId) ?? '', profileImageUrl: null, bio: null }; }
  async save(userId: string, _role: 'CLIENT' | 'FREELANCER', input: ProfileData): Promise<ProfileData> { this.names.set(userId, input.name); this.profiles.set(userId, input); return input; }
}
