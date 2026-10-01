import { Router, type RequestHandler, type Response } from 'express';
import { skillKey, type ProfileData, type ProfileRepository } from './profile.repository';

/**
 * 2026-10-01 수정 — "구글 로그인 후 프로필 저장이 안 됨" 대응.
 *
 * 원인(요약):
 *   1. 의뢰인 프로필의 business_field는 DB에서 필수(NOT NULL enum)인데 화면이 이 값을 보내지 않았다.
 *      소셜 로그인으로 막 가입한 사용자는 client_profiles 행이 없어 upsert가 "생성" 경로를 타고,
 *      Prisma가 `businessField is missing` 검증 오류를 던졌다.
 *   2. 프리랜서 기술은 skills.id(예: REACT) FK인데 화면은 자유 입력("React")을 그대로 보내 FK 위반이 났다.
 *      → RFP §3.1.3·ERD E-15대로 공식 기술은 이름/코드로 매칭하고, 없으면 본인 커스텀 기술로 만든다
 *        (profile.repository.ts resolveSkillIds). GET의 skills는 이제 표시명 목록이다.
 *   3. 위 오류들이 async 핸들러 밖으로 새어 나갔다(Express 4는 async 오류를 못 잡는다) →
 *      응답이 오지 않아 버튼이 "저장 중…"에 멈췄고, 로컬에서는 콘솔에만 unhandledRejection이 남았다.
 *   4. users 갱신과 프로필 upsert가 트랜잭션이 아니어서 이름만 저장되고 나머지는 빠지는 부분 저장이 생겼다.
 *
 * 이 라우터는 이제 (a) 역할별 필수값을 먼저 검증해 422로 이유를 알려주고, (b) 예상 못한 오류도
 * try/catch로 잡아 500 JSON을 돌려준다. 부분 저장 방지는 profile.repository.ts의 트랜잭션이 맡는다.
 */
const CATEGORIES = new Set(['WEB_DEVELOPMENT', 'MOBILE_APP', 'DESIGN', 'DATA_AI', 'PLANNING', 'MARKETING']);

type Invalid = { field: string; message: string };

function invalid(res: Response, problem: Invalid) {
  return res.status(422).json({ error: { code: 'PROFILE_INVALID', message: problem.message, details: { field: problem.field } } });
}

function optionalText(value: unknown, max: number): string | null | undefined | false {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length > max) return false;
  return trimmed.length ? trimmed : null;
}

function optionalUrl(value: unknown): string | null | false {
  const text = optionalText(value, 2000);
  if (text === false || text === null || text === undefined) return text ?? null;
  return /^https?:\/\/\S+$/i.test(text) ? text : false;
}

export function createProfileRouter(repo: ProfileRepository, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/api/v1/profiles/me', requireAuth, async (req, res) => {
    try {
      const profile = await repo.get(req.user!.userId, req.user!.role);
      if (!profile) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: '프로필을 찾을 수 없습니다.' } });
      const complete = req.user!.role === 'CLIENT'
        ? Boolean(profile.name.trim() && profile.companyName?.trim() && profile.businessField)
        : Boolean(profile.name.trim() && profile.primaryCategory && profile.careerYears !== null && profile.skills?.length);
      return res.json({ profile, complete });
    } catch (error) {
      console.error('[profiles] GET /me 실패:', error);
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' } });
    }
  });

  router.patch('/api/v1/profiles/me', requireAuth, async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const role = req.user!.role;

      if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 50) {
        return invalid(res, { field: 'name', message: '이름을 1~50자로 입력해 주세요.' });
      }
      const bio = optionalText(body.bio, 500);
      if (bio === false) return invalid(res, { field: 'bio', message: '한 줄 소개는 500자 이하로 입력해 주세요.' });
      const profileImageUrl = optionalUrl(body.profileImageUrl);
      if (profileImageUrl === false) return invalid(res, { field: 'profileImageUrl', message: '프로필 이미지 주소 형식을 확인해 주세요.' });

      const input: ProfileData = { name: body.name.trim(), bio: bio ?? null, profileImageUrl };

      if (role === 'CLIENT') {
        const companyName = optionalText(body.companyName, 100);
        if (!companyName) return invalid(res, { field: 'companyName', message: '회사명을 1~100자로 입력해 주세요.' });
        if (typeof body.businessField !== 'string' || !CATEGORIES.has(body.businessField)) {
          return invalid(res, { field: 'businessField', message: '사업 분야를 선택해 주세요.' });
        }
        // business_field_etc: 현 enum에 ETC가 없어 항상 NULL이어야 한다(user-management spec PC-02, OPEN 항목).
        const websiteUrl = optionalUrl(body.websiteUrl);
        if (websiteUrl === false) return invalid(res, { field: 'websiteUrl', message: '웹사이트는 http:// 또는 https://로 시작하는 주소로 입력해 주세요.' });
        Object.assign(input, { companyName, businessField: body.businessField, businessFieldEtc: null, websiteUrl });
      } else {
        if (typeof body.primaryCategory !== 'string' || !CATEGORIES.has(body.primaryCategory)) {
          return invalid(res, { field: 'primaryCategory', message: '주요 활동 분야를 선택해 주세요.' });
        }
        const careerYears = body.careerYears ?? 0;
        if (typeof careerYears !== 'number' || !Number.isInteger(careerYears) || careerYears < 0 || careerYears > 32767) {
          return invalid(res, { field: 'careerYears', message: '경력 연수는 0 이상의 정수로 입력해 주세요.' });
        }
        const hourlyRateAmount = body.hourlyRateAmount ?? null;
        if (hourlyRateAmount !== null && (typeof hourlyRateAmount !== 'number' || !Number.isInteger(hourlyRateAmount) || hourlyRateAmount < 0)) {
          return invalid(res, { field: 'hourlyRateAmount', message: '시급은 0 이상의 정수로 입력해 주세요.' });
        }
        const portfolioUrl = optionalUrl(body.portfolioUrl);
        if (portfolioUrl === false) return invalid(res, { field: 'portfolioUrl', message: '포트폴리오는 http:// 또는 https://로 시작하는 주소로 입력해 주세요.' });
        // 기술은 코드("REACT")나 이름("React", "Node.js") 또는 커스텀 이름 모두 받는다. 같은 키는 하나로 합친다.
        const rawSkills = Array.isArray(body.skills) ? body.skills : [];
        if (rawSkills.some((s) => typeof s !== 'string' || s.trim().length > 50)) return invalid(res, { field: 'skills', message: '기술 이름은 50자 이하로 입력해 주세요.' });
        const seen = new Set<string>();
        const skills = (rawSkills as string[]).map((s) => s.trim()).filter((s) => { const k = skillKey(s); if (!k || seen.has(k)) return false; seen.add(k); return true; });
        if (!skills.length) return invalid(res, { field: 'skills', message: '기술을 1개 이상 입력해 주세요.' });
        if (skills.length > 20) return invalid(res, { field: 'skills', message: '기술은 20개까지 입력할 수 있습니다.' });
        Object.assign(input, { primaryCategory: body.primaryCategory, careerYears, hourlyRateAmount, portfolioUrl, skills });
      }

      const profile = await repo.save(req.user!.userId, role, input);
      return res.json({ profile });
    } catch (error) {
      console.error('[profiles] PATCH /me 실패:', error);
      return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '프로필을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' } });
    }
  });

  return router;
}
