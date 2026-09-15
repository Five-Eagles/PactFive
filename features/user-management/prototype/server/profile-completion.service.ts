import type { ProfileCompletion, ProfileCompletionPort, ProfileMissingField } from "./profile-completion.port";
import type { ProfileCompletionRepository, ProfileCompletionSnapshot } from "./profile-completion.repository";

// ERD E-27/D-91 및 현 Prisma enum. 옛 ETC 설명을 근거로 폐기된 값을 다시 허용하지 않는다.
const PROFILE_CATEGORIES: ReadonlySet<string> = new Set([
  "WEB_DEVELOPMENT", "MOBILE_APP", "DESIGN", "DATA_AI", "PLANNING", "MARKETING",
]);

function unavailable(): ProfileCompletion {
  return { status: "UNAVAILABLE", completedAt: null, missingFields: [] };
}

function isIdentifier(candidate: unknown, maxLength?: number): candidate is string {
  return typeof candidate === "string" && candidate.length > 0 && (maxLength === undefined || candidate.length <= maxLength)
    && !/[\s\u0000-\u001f\u007f]/u.test(candidate);
}

function isNullableString(candidate: unknown): boolean {
  return candidate === null || typeof candidate === "string";
}

function hasValidProfileShape(snapshot: ProfileCompletionSnapshot): boolean {
  if (snapshot.profile === null) return true;
  if (!snapshot.profile || snapshot.profile.userId !== snapshot.userId
    || !isNullableString(snapshot.profile.completedAt)) return false;
  if (snapshot.role === "CLIENT") {
    return isNullableString(snapshot.profile.companyName) && isNullableString(snapshot.profile.businessField)
      && isNullableString(snapshot.profile.businessFieldEtc);
  }
  return isNullableString(snapshot.profile.primaryCategory)
    && (snapshot.profile.careerYears === null || typeof snapshot.profile.careerYears === "number")
    && Array.isArray(snapshot.profile.skills)
    && Array.from(snapshot.profile.skills).every((skill) => skill && typeof skill.skillId === "string"
      && typeof skill.isActive === "boolean");
}

function isCategory(candidate: unknown): boolean {
  return typeof candidate === "string" && PROFILE_CATEGORIES.has(candidate);
}

/** UTC ISO 문자열의 달력 유효성도 확인한다(2월 30일 등의 자동 보정은 거부). */
function getStoredCompletionTime(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(candidate)) {
    return null;
  }
  const instant = new Date(candidate);
  if (!Number.isFinite(instant.getTime())) return null;
  const normalized = instant.toISOString();
  const expected = candidate.includes(".") ? candidate : candidate.replace("Z", ".000Z");
  return normalized === expected ? normalized : null;
}

function getMissingFields(snapshot: ProfileCompletionSnapshot): ProfileMissingField[] {
  const missingFields: ProfileMissingField[] = [];
  if (snapshot.role === "CLIENT") {
    const profile = snapshot.profile;
    if (typeof profile?.companyName !== "string" || profile.companyName.trim().length === 0
      || profile.companyName.length > 100) missingFields.push("CLIENT_COMPANY_NAME");
    if (!isCategory(profile?.businessField)) missingFields.push("CLIENT_BUSINESS_FIELD");
    if (profile && profile.businessFieldEtc !== null) missingFields.push("CLIENT_BUSINESS_FIELD_ETC");
  } else {
    const profile = snapshot.profile;
    if (!isCategory(profile?.primaryCategory)) missingFields.push("FREELANCER_PRIMARY_CATEGORY");
    if (typeof profile?.careerYears !== "number" || !Number.isInteger(profile.careerYears)
      || profile.careerYears < 0 || profile.careerYears > 32_767) missingFields.push("FREELANCER_CAREER_YEARS");
    if (!profile?.skills.some((skill) => skill && skill.isActive === true && isIdentifier(skill.skillId, 40))) {
      missingFields.push("FREELANCER_SKILLS");
    }
  }
  return missingFields;
}

/** 저장소를 필수로 주입한다. 장애 시 항상 COMPLETE를 반환하는 기본 adapter는 제공하지 않는다. */
export function createProfileCompletionPort(repository: ProfileCompletionRepository): ProfileCompletionPort {
  return {
    async getProfileCompletion(userId): Promise<ProfileCompletion> {
      // 기존 인증 구현의 36자 ID도 불투명 식별자로 조회한다. DB 길이 제약을 여기서 재정의하지 않는다.
      if (!isIdentifier(userId)) return unavailable();
      try {
        const snapshot = await repository.findProfileCompletionSnapshot(userId);
        if (!snapshot || snapshot.userId !== userId || snapshot.deletedAt !== null
          || (snapshot.role !== "CLIENT" && snapshot.role !== "FREELANCER")) return unavailable();
        // undefined 등 잘못된 저장소 응답과 실제 profile:null(아직 작성 안 함)을 구분한다.
        if (!hasValidProfileShape(snapshot)) return unavailable();

        const missingFields = getMissingFields(snapshot);
        if (missingFields.length > 0) return { status: "INCOMPLETE", completedAt: null, missingFields };
        const completedAt = getStoredCompletionTime(snapshot.profile?.completedAt);
        if (!completedAt) return unavailable();
        return { status: "COMPLETE", completedAt, missingFields: [] };
      } catch {
        // 저장소 오류·비정상 snapshot을 소비 도메인이 처리할 수 있는 동일 실패 상태로 축소한다.
        return unavailable();
      }
    },
  };
}
