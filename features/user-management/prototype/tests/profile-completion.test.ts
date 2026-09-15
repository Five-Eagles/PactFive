import assert from "node:assert/strict";
import { InMemoryProfileCompletionRepository } from "../mock/in-memory-profile-completion.repository";
import type { ProfileCompletion } from "../server/profile-completion.port";
import type {
  ClientProfileCompletionRow,
  FreelancerProfileCompletionRow,
  ProfileCompletionRepository,
  ProfileCompletionSnapshot,
} from "../server/profile-completion.repository";
import { createProfileCompletionPort } from "../server/profile-completion.service";

const USER_ID = "usr_profile";
const STORED_COMPLETED_AT = "2026-09-01T03:04:05.678Z";
const CATEGORIES = ["WEB_DEVELOPMENT", "MOBILE_APP", "DESIGN", "DATA_AI", "PLANNING", "MARKETING"];
const CLIENT_REQUIRED_FIELDS = ["CLIENT_COMPANY_NAME", "CLIENT_BUSINESS_FIELD"];
const FREELANCER_REQUIRED_FIELDS = ["FREELANCER_PRIMARY_CATEGORY", "FREELANCER_CAREER_YEARS", "FREELANCER_SKILLS"];

function clientSnapshot(overrides: Partial<ClientProfileCompletionRow> = {}, userId = USER_ID) {
  return {
    userId,
    deletedAt: null,
    role: "CLIENT" as const,
    profile: {
      userId,
      companyName: "팩트파이브",
      businessField: "WEB_DEVELOPMENT",
      businessFieldEtc: null,
      completedAt: STORED_COMPLETED_AT,
      ...overrides,
    },
  };
}

function freelancerSnapshot(overrides: Partial<FreelancerProfileCompletionRow> = {}, userId = USER_ID) {
  return {
    userId,
    deletedAt: null,
    role: "FREELANCER" as const,
    profile: {
      userId,
      primaryCategory: "WEB_DEVELOPMENT",
      careerYears: 0,
      skills: [{ skillId: "typescript", isActive: true }],
      completedAt: STORED_COMPLETED_AT,
      ...overrides,
    },
  };
}

function complete(completedAt = STORED_COMPLETED_AT): ProfileCompletion {
  return { status: "COMPLETE", completedAt, missingFields: [] };
}

function incomplete(missingFields: string[]): ProfileCompletion {
  return { status: "INCOMPLETE", completedAt: null, missingFields };
}

function unavailable(): ProfileCompletion {
  return { status: "UNAVAILABLE", completedAt: null, missingFields: [] };
}

// 타입을 위반하는 저장소 응답도 의도적으로 주입해 실제 adapter 경계의 실패 처리를 확인한다.
async function evaluateSnapshot(snapshot: unknown, userId = USER_ID): Promise<ProfileCompletion> {
  const repository: ProfileCompletionRepository = {
    async findProfileCompletionSnapshot() {
      return snapshot as ProfileCompletionSnapshot | null;
    },
  };
  return createProfileCompletionPort(repository).getProfileCompletion(userId);
}

export async function runProfileCompletionTests(
  test: (group: string, name: string, action: () => unknown | Promise<unknown>) => Promise<void>,
): Promise<void> {
  const group = "프로필 완성도";

  await test(group, "PC-02·03: 역할별 필수 항목만 있으면 선택 정보 없이 완성된다", async () => {
    for (const snapshot of [clientSnapshot(), freelancerSnapshot()]) {
      assert.deepEqual(await evaluateSnapshot(snapshot), complete());
    }
  });

  await test(group, "PC-02: 회사명은 공백이 아닌 1~100자만 유효하다", async () => {
    for (const companyName of ["가", "가".repeat(100), " 팩트파이브 "]) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ companyName })), complete());
    }
    for (const companyName of [null, "", " \t\n", "가".repeat(101)]) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ companyName })), incomplete(["CLIENT_COMPANY_NAME"]));
    }
  });

  await test(group, "PC-02·03: 두 역할 모두 현재 카테고리 6종을 허용한다", async () => {
    for (const category of CATEGORIES) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ businessField: category })), complete());
      assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ primaryCategory: category })), complete());
    }
  });

  await test(group, "PC-02·03: 폐기된 기타·앱개발 값과 잘못된 카테고리는 미완성이다", async () => {
    for (const category of [null, "", "ETC", "APP_DEVELOPMENT", "web_development", "DESIGN "]) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ businessField: category })), incomplete(["CLIENT_BUSINESS_FIELD"]));
      assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ primaryCategory: category })), incomplete(["FREELANCER_PRIMARY_CATEGORY"]));
    }
  });

  await test(group, "PC-02: 기타 분야 잔존값은 빈 문자열이어도 미완성 코드로 반환한다", async () => {
    for (const businessFieldEtc of ["", " ", "기타 사업"]) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ businessFieldEtc })), incomplete(["CLIENT_BUSINESS_FIELD_ETC"]));
    }
  });

  await test(group, "PC-03: 경력 0과 32767은 허용하고 범위 밖·소수·비유한 수는 거부한다", async () => {
    for (const careerYears of [0, 1, 32767]) {
      assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ careerYears })), complete());
    }
    for (const careerYears of [null, -1, 32768, 0.5, NaN, Infinity, -Infinity]) {
      assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ careerYears })), incomplete(["FREELANCER_CAREER_YEARS"]));
    }
  });

  await test(group, "PC-03: 본인 연결 기술 중 활성 기술 하나면 충분하고 40자 기술 ID도 허용한다", async () => {
    const skills = [
      { skillId: "inactive-skill", isActive: false },
      { skillId: "s".repeat(40), isActive: true },
    ];
    assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ skills })), complete());
  });

  await test(group, "PC-03: 빈 연결·비활성 기술·유효하지 않은 기술 ID는 필수 기술을 채우지 못한다", async () => {
    const skillLists: FreelancerProfileCompletionRow["skills"][] = [
      [],
      [{ skillId: "typescript", isActive: false }],
      ...["", " ", "bad\nidentifier", "bad\u0000identifier", "s".repeat(41)].map((skillId) => [{ skillId, isActive: true }]),
    ];
    for (const skills of skillLists) {
      assert.deepEqual(await evaluateSnapshot(freelancerSnapshot({ skills })), incomplete(["FREELANCER_SKILLS"]));
    }
  });

  await test(group, "PC-04: 프로필 행이 없으면 역할별 필수 코드 전체를 고정 순서로 반환한다", async () => {
    assert.deepEqual(await evaluateSnapshot({ ...clientSnapshot(), profile: null }), incomplete(CLIENT_REQUIRED_FIELDS));
    assert.deepEqual(await evaluateSnapshot({ ...freelancerSnapshot(), profile: null }), incomplete(FREELANCER_REQUIRED_FIELDS));
  });

  await test(group, "PC-04: 여러 미완성 필드는 고정 순서이며 과거 완성 시각보다 우선한다", async () => {
    assert.deepEqual(
      await evaluateSnapshot(clientSnapshot({ companyName: null, businessField: "ETC", businessFieldEtc: "남은 기타" })),
      incomplete([...CLIENT_REQUIRED_FIELDS, "CLIENT_BUSINESS_FIELD_ETC"]),
    );
    for (const completedAt of [STORED_COMPLETED_AT, null, "잘못된 시각"]) {
      assert.deepEqual(
        await evaluateSnapshot(freelancerSnapshot({ primaryCategory: null, careerYears: null, skills: [], completedAt })),
        incomplete(FREELANCER_REQUIRED_FIELDS),
      );
    }
  });

  await test(group, "PC-01·06: 기존 인증의 36자 ID를 자르거나 다른 ID로 치환하지 않고 조회한다", async () => {
    const userId = "usr_0123456789abcdef0123456789abcdef";
    assert.equal(userId.length, 36);
    const requestedUserIds: string[] = [];
    const port = createProfileCompletionPort({
      async findProfileCompletionSnapshot(requestedUserId) {
        requestedUserIds.push(requestedUserId);
        return clientSnapshot({}, userId);
      },
    });
    assert.deepEqual(await port.getProfileCompletion(userId), complete());
    assert.deepEqual(requestedUserIds, [userId]);
  });

  await test(group, "PC-06: 빈값·공백·제어문자·문자열 아닌 ID는 저장소 호출 없이 조회 불가다", async () => {
    let readCount = 0;
    const port = createProfileCompletionPort({
      async findProfileCompletionSnapshot() { readCount += 1; return clientSnapshot(); },
    });
    for (const userId of ["", " ", "usr profile", "usr\nprofile", "usr\u0000profile", "usr\u007fprofile", null, undefined, 1]) {
      assert.deepEqual(await port.getProfileCompletion(userId as string), unavailable());
    }
    assert.equal(readCount, 0);
  });

  await test(group, "PC-06: 알 수 없는 계정과 탈퇴 계정은 완성 프로필이 있어도 조회 불가다", async () => {
    const repository = new InMemoryProfileCompletionRepository([
      { ...clientSnapshot(), deletedAt: "2026-09-08T00:00:00.000Z" },
    ]);
    const port = createProfileCompletionPort(repository);
    assert.deepEqual(await port.getProfileCompletion("usr_unknown"), unavailable());
    assert.deepEqual(await port.getProfileCompletion(USER_ID), unavailable());
  });

  await test(group, "PC-01·06: 다른 계정의 snapshot·프로필과 알 수 없는 역할은 거부한다", async () => {
    const invalidSnapshots = [
      clientSnapshot({}, "usr_other"),
      clientSnapshot({ userId: "usr_other" }),
      freelancerSnapshot({ userId: "usr_other" }),
      { ...clientSnapshot(), role: "ADMIN" },
      { ...clientSnapshot(), role: "client" },
      { ...clientSnapshot(), profile: freelancerSnapshot().profile },
    ];
    for (const snapshot of invalidSnapshots) assert.deepEqual(await evaluateSnapshot(snapshot), unavailable());
  });

  await test(group, "PC-06: 누락·잘못된 타입의 snapshot과 필드는 미완성으로 위장하지 않는다", async () => {
    const invalidSnapshots: unknown[] = [
      undefined, false, {}, [],
      { ...clientSnapshot(), deletedAt: undefined },
      { ...clientSnapshot(), profile: undefined },
      { ...clientSnapshot(), profile: {} },
      { ...clientSnapshot(), profile: { ...clientSnapshot().profile, companyName: 123 } },
      { ...clientSnapshot(), profile: { ...clientSnapshot().profile, businessField: [] } },
      { ...clientSnapshot(), profile: { ...clientSnapshot().profile, businessFieldEtc: undefined } },
      { ...clientSnapshot(), profile: { ...clientSnapshot().profile, completedAt: new Date(STORED_COMPLETED_AT) } },
      { ...freelancerSnapshot(), profile: { ...freelancerSnapshot().profile, careerYears: "0" } },
      { ...freelancerSnapshot(), profile: { ...freelancerSnapshot().profile, primaryCategory: undefined } },
    ];
    for (const snapshot of invalidSnapshots) assert.deepEqual(await evaluateSnapshot(snapshot), unavailable());
  });

  await test(group, "PC-06: 활성 기술이 섞여 있어도 불량 항목·희소 배열이 있으면 조회 불가다", async () => {
    const activeSkill = { skillId: "typescript", isActive: true };
    const invalidSkillLists: unknown[] = [
      null, undefined, {},
      [null, activeSkill], [activeSkill, undefined], [activeSkill, null],
      [activeSkill, { skillId: "react", isActive: "true" }],
      [activeSkill, { skillId: 123, isActive: true }],
      [activeSkill, {}],
      Array(2),
    ];
    const sparseSkills = [activeSkill];
    sparseSkills.length = 2;
    invalidSkillLists.push(sparseSkills);
    for (const skills of invalidSkillLists) {
      const snapshot = freelancerSnapshot();
      assert.deepEqual(await evaluateSnapshot({ ...snapshot, profile: { ...snapshot.profile, skills } }), unavailable());
    }
  });

  await test(group, "PC-06: 동기 예외와 비동기 거절은 내부 메시지 없이 같은 조회 불가로 축소한다", async () => {
    const repositories: ProfileCompletionRepository[] = [
      { findProfileCompletionSnapshot() { throw new Error("내부 연결 정보"); } },
      { async findProfileCompletionSnapshot() { throw new Error("다른 사용자 개인정보"); } },
    ];
    for (const repository of repositories) {
      assert.deepEqual(await createProfileCompletionPort(repository).getProfileCompletion(USER_ID), unavailable());
    }
  });

  await test(group, "PC-05: 저장된 UTC 시각을 보존하고 초 단위와 실제 윤년 날짜만 정규화한다", async () => {
    for (const [stored, expected] of [
      [STORED_COMPLETED_AT, STORED_COMPLETED_AT],
      ["2026-09-01T03:04:05Z", "2026-09-01T03:04:05.000Z"],
      ["2024-02-29T23:59:59.000Z", "2024-02-29T23:59:59.000Z"],
    ]) {
      assert.deepEqual(await evaluateSnapshot(clientSnapshot({ completedAt: stored })), complete(expected));
    }
  });

  await test(group, "PC-05: 필드가 완성돼도 시각 누락·자동 보정 날짜·UTC 아닌 시각이면 조회 불가다", async () => {
    for (const completedAt of [
      null, "", "잘못된 날짜", "2026-02-30T00:00:00.000Z", "2025-02-29T00:00:00.000Z",
      "2026-04-31T00:00:00.000Z", "2026-09-01T24:00:00.000Z", "2026-09-01T03:04:60.000Z",
      "2026-09-01T03:04:05+09:00", "2026-09-01T03:04:05", "2026-09-01T03:04:05.12Z",
      "2026-09-01T03:04:05.678Z\n",
    ]) {
      for (const snapshot of [clientSnapshot({ completedAt }), freelancerSnapshot({ completedAt })]) {
        assert.deepEqual(await evaluateSnapshot(snapshot), unavailable());
      }
    }
  });

  await test(group, "PC-01·07: 호출마다 snapshot을 한 번 읽고 동결된 원본을 수정하지 않는다", async () => {
    const snapshot = freelancerSnapshot();
    Object.freeze(snapshot.profile.skills[0]);
    Object.freeze(snapshot.profile.skills);
    Object.freeze(snapshot.profile);
    Object.freeze(snapshot);
    const before = structuredClone(snapshot);
    let readCount = 0;
    const port = createProfileCompletionPort({
      async findProfileCompletionSnapshot(userId) {
        assert.equal(userId, USER_ID);
        readCount += 1;
        return snapshot;
      },
    });
    assert.deepEqual(await port.getProfileCompletion(USER_ID), complete());
    assert.deepEqual(await port.getProfileCompletion(USER_ID), complete());
    assert.equal(readCount, 2);
    assert.deepEqual(snapshot, before);
  });

  await test(group, "PC-07: Mock은 seed 입력과 조회 반환의 중첩 기술 객체까지 복제한다", async () => {
    const snapshot = freelancerSnapshot();
    const repository = new InMemoryProfileCompletionRepository([snapshot]);
    snapshot.profile.skills[0].isActive = false;
    snapshot.profile.completedAt = null;
    const firstRead = await repository.findProfileCompletionSnapshot(USER_ID);
    assert.ok(firstRead?.role === "FREELANCER" && firstRead.profile);
    firstRead.profile.skills[0].isActive = false;
    firstRead.profile.primaryCategory = null;
    assert.deepEqual(await createProfileCompletionPort(repository).getProfileCompletion(USER_ID), complete());
    assert.deepEqual(await repository.findProfileCompletionSnapshot(USER_ID), freelancerSnapshot());
  });

  await test(group, "PC-07: 반환 객체와 누락 코드 배열은 호출 간 공유되지 않는다", async () => {
    for (const snapshot of [clientSnapshot(), clientSnapshot({ companyName: null }), null]) {
      const repository: ProfileCompletionRepository = { async findProfileCompletionSnapshot() { return snapshot; } };
      const port = createProfileCompletionPort(repository);
      const firstResponse = await port.getProfileCompletion(USER_ID);
      const expected = structuredClone(firstResponse);
      firstResponse.missingFields.push("호출자가 추가한 값");
      firstResponse.status = "COMPLETE";
      firstResponse.completedAt = "호출자가 바꾼 시각";
      const nextResponse = await port.getProfileCompletion(USER_ID);
      assert.deepEqual(nextResponse, expected);
      assert.notEqual(nextResponse, firstResponse);
      assert.notEqual(nextResponse.missingFields, firstResponse.missingFields);
    }
  });

  await test(group, "PC-01·07: 계정과 Mock 인스턴스를 분리하고 다른 계정의 활성 기술을 빌리지 않는다", async () => {
    const repository = new InMemoryProfileCompletionRepository([
      freelancerSnapshot({}, "usr_complete"),
      freelancerSnapshot({ skills: [] }, "usr_incomplete"),
    ]);
    const port = createProfileCompletionPort(repository);
    const [completed, uncompleted] = await Promise.all([
      port.getProfileCompletion("usr_complete"), port.getProfileCompletion("usr_incomplete"),
    ]);
    assert.deepEqual(completed, complete());
    assert.deepEqual(uncompleted, incomplete(["FREELANCER_SKILLS"]));
    const isolatedPort = createProfileCompletionPort(new InMemoryProfileCompletionRepository());
    assert.deepEqual(await isolatedPort.getProfileCompletion("usr_complete"), unavailable());
  });

  await test(group, "PC-07: 다음 조회는 기술 비활성화·연결 해제·복구·탈퇴의 최신 seed 상태를 반영한다", async () => {
    const repository = new InMemoryProfileCompletionRepository([freelancerSnapshot()]);
    const port = createProfileCompletionPort(repository);
    assert.deepEqual(await port.getProfileCompletion(USER_ID), complete());
    repository.seedSnapshot(freelancerSnapshot({ skills: [{ skillId: "typescript", isActive: false }] }));
    assert.deepEqual(await port.getProfileCompletion(USER_ID), incomplete(["FREELANCER_SKILLS"]));
    repository.seedSnapshot(freelancerSnapshot({ skills: [] }));
    assert.deepEqual(await port.getProfileCompletion(USER_ID), incomplete(["FREELANCER_SKILLS"]));
    const restoredAt = "2026-09-08T06:00:00.000Z";
    repository.seedSnapshot(freelancerSnapshot({ completedAt: restoredAt }));
    assert.deepEqual(await port.getProfileCompletion(USER_ID), complete(restoredAt));
    repository.seedSnapshot({ ...freelancerSnapshot(), deletedAt: restoredAt });
    assert.deepEqual(await port.getProfileCompletion(USER_ID), unavailable());
  });
}
