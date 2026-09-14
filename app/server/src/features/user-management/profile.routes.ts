import { Router, type RequestHandler } from 'express';
import type { ProfileRepository } from './profile.repository';

export function createProfileRouter(repo: ProfileRepository, requireAuth: RequestHandler): Router {
  const router = Router();
  router.get('/api/v1/profiles/me', requireAuth, async (req, res) => {
    const profile = await repo.get(req.user!.userId, req.user!.role);
    if (!profile) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: '프로필을 찾을 수 없습니다.' } });
    const complete = req.user!.role === 'CLIENT'
      ? Boolean(profile.name.trim() && profile.companyName?.trim())
      : Boolean(profile.name.trim() && profile.primaryCategory && profile.careerYears !== null && profile.skills?.length);
    return res.json({ profile, complete });
  });
  router.patch('/api/v1/profiles/me', requireAuth, async (req, res) => {
    const body = req.body ?? {};
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 50) return res.status(422).json({ error: { code: 'PROFILE_INVALID', message: '이름을 입력해 주세요.' } });
    const profile = await repo.save(req.user!.userId, req.user!.role, { ...body, name: body.name.trim(), profileImageUrl: body.profileImageUrl ?? null, bio: body.bio ?? null });
    return res.json({ profile });
  });
  return router;
}
