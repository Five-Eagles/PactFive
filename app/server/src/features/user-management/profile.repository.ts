import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';

/**
 * 기술 이름 비교 키 — 대소문자·공백·기호를 무시한다("Node.js" = "nodejs" = "NODEJS", "HTML/CSS" = "html_css").
 * ERD E-15의 name_key(정규화 키)와 같은 목적이다. 한글은 그대로 남긴다.
 */
export function skillKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

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
      include: { clientProfile: true, freelancerProfile: { include: { freelancerSkills: { include: { skill: true } } } } },
    });
    if (!user) return null;
    const base = { name: user.name, profileImageUrl: user.profileImageUrl, bio: user.bio };
    if (role === 'CLIENT') {
      const p = user.clientProfile;
      return { ...base, companyName: p?.companyName ?? null, businessField: p?.businessField ?? null, businessFieldEtc: p?.businessFieldEtc ?? null, websiteUrl: p?.websiteUrl ?? null };
    }
    const p = user.freelancerProfile;
    return { ...base, primaryCategory: p?.primaryCategory ?? null, careerYears: p?.careerYears ?? null, hourlyRateAmount: p?.hourlyRateAmount ?? null, portfolioUrl: p?.portfolioUrl ?? null, skills: p?.freelancerSkills.filter((s) => s.skill.isActive).map((s) => s.skill.name) ?? [] };
  }

  async save(userId: string, role: 'CLIENT' | 'FREELANCER', input: ProfileData): Promise<ProfileData> {
    // 2026-10-01: users 갱신과 프로필 upsert를 한 트랜잭션으로 묶는다 — 이전에는 이름만 저장되고
    // 프로필 upsert가 실패하는 부분 저장이 생겼다(profile.routes.ts 헤더 주석 참고).
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { name: input.name, bio: input.bio, profileImageUrl: input.profileImageUrl } });
      if (role === 'CLIENT') {
        const data = { companyName: input.companyName ?? '', businessField: input.businessField as never, businessFieldEtc: input.businessFieldEtc ?? null, websiteUrl: input.websiteUrl ?? null, completedAt: new Date() };
        await tx.clientProfile.upsert({ where: { userId }, create: { id: `cprof_${userId}`, userId, ...data }, update: data });
      } else {
        const data = { primaryCategory: input.primaryCategory as never, careerYears: input.careerYears ?? 0, hourlyRateAmount: input.hourlyRateAmount ?? null, portfolioUrl: input.portfolioUrl ?? null, completedAt: new Date() };
        const p = await tx.freelancerProfile.upsert({ where: { userId }, create: { id: `fprof_${userId}`, userId, ...data }, update: data });
        const skillIds = await this.resolveSkillIds(tx, userId, input.skills ?? []);
        await tx.freelancerSkill.deleteMany({ where: { freelancerProfileId: p.id } });
        if (skillIds.length) await tx.freelancerSkill.createMany({ data: skillIds.map((skillId) => ({ freelancerProfileId: p.id, skillId })), skipDuplicates: true });
      }
    });
    return (await this.get(userId, role))!;
  }

  /**
   * 입력한 기술(코드 또는 이름)을 skills.id로 바꾼다 — RFP §3.1.3 "옵션 선택 + 커스텀 추가 허용", ERD E-15.
   *   1. 공식 기술(is_custom=false, 활성)의 코드·표시명과 정규화 키가 같으면 그 공식 기술을 연결한다.
   *   2. 아니면 이 프리랜서가 이전에 만든 같은 이름의 커스텀 기술을 재사용한다(비활성이었다면 다시 활성화).
   *   3. 그래도 없으면 커스텀 기술을 새로 만든다(is_custom=true, created_by_user_id=본인, group=ETC).
   * 커스텀 기술은 프로젝트 요구 기술로는 쓸 수 없다(D-64) — 그 검사는 project-management 몫이다.
   */
  private async resolveSkillIds(tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0], userId: string, inputs: string[]): Promise<string[]> {
    if (!inputs.length) return [];
    const official = await tx.skill.findMany({ where: { isCustom: false, isActive: true }, select: { id: true, name: true } });
    const officialByKey = new Map<string, string>();
    for (const s of official) { officialByKey.set(skillKey(s.id), s.id); officialByKey.set(skillKey(s.name), s.id); }
    const mine = await tx.skill.findMany({ where: { isCustom: true, createdByUserId: userId }, select: { id: true, nameKey: true, isActive: true } });
    const mineByKey = new Map(mine.map((s) => [s.nameKey, s] as const));
    const ids: string[] = [];
    for (const raw of inputs) {
      const name = raw.trim();
      const key = skillKey(name);
      const officialId = officialByKey.get(key);
      if (officialId) { ids.push(officialId); continue; }
      const existing = mineByKey.get(key);
      if (existing) {
        if (!existing.isActive) await tx.skill.update({ where: { id: existing.id }, data: { isActive: true } });
        ids.push(existing.id);
        continue;
      }
      const created = await tx.skill.create({ data: { id: `CUSTOM_${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`, name, nameKey: key, groupCode: 'ETC', isCustom: true, createdByUserId: userId, isActive: true } });
      mineByKey.set(key, { id: created.id, nameKey: key, isActive: true });
      ids.push(created.id);
    }
    return [...new Set(ids)];
  }
}

export class InMemoryProfileRepository implements ProfileRepository {
  private readonly profiles = new Map<string, ProfileData>();
  constructor(private readonly names: Map<string, string>) {}
  async get(userId: string): Promise<ProfileData | null> { return this.profiles.get(userId) ?? { name: this.names.get(userId) ?? '', profileImageUrl: null, bio: null }; }
  async save(userId: string, _role: 'CLIENT' | 'FREELANCER', input: ProfileData): Promise<ProfileData> { this.names.set(userId, input.name); this.profiles.set(userId, input); return input; }
}
