import assert from "node:assert/strict";
import { InMemoryUserRatingRepository } from "../mock/in-memory-user-rating.repository";
import type { PublishedRatingAggregateReader, ReviewCreatedEvent } from "../server/user-rating.port";
import type { UserRatingRepository, UserRatingTransaction } from "../server/user-rating.repository";
import { createReviewCreatedConsumer, UserRatingProjectionError } from "../server/user-rating.service";

const event: ReviewCreatedEvent = { reviewId: "rvw_first", projectId: "prj_first", revieweeId: "usr_target", rating: 1, publishedAt: "2026-09-08T00:00:00Z" };
const row = (userId = event.revieweeId) => ({ userId, deletedAt: null, ratingAverage: 2, reviewCount: 1 });
const reader = (ratingSum: number, reviewCount: number): PublishedRatingAggregateReader => ({
  async getPublishedRatingAggregate() { return { ratingSum, reviewCount }; },
});
const matches = (code: UserRatingProjectionError["code"], retryable: boolean) => (error: unknown) =>
  error instanceof UserRatingProjectionError && error.code === code && error.retryable === retryable;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

export async function runUserRatingTests(
  test: (group: string, name: string, action: () => unknown | Promise<unknown>) => Promise<void>,
): Promise<void> {
  const group = "사용자 평점 캐시";
  await test(group, "UR-01·02: 이벤트 별점 대신 공개 합계로 두 캐시 필드를 교체한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    let received: string | undefined;
    await createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate(userId) {
      received = userId; return { ratingSum: 14, reviewCount: 3 };
    } }).publishReviewCreated(event);
    assert.equal(received, event.revieweeId);
    assert.deepEqual(repository.getUser(event.revieweeId), { ...row(), ratingAverage: 4.67, reviewCount: 3 });
  });
  await test(group, "UR-02: 공개 리뷰가 없으면 오래된 캐시를 널·영 건으로 지운다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    await createReviewCreatedConsumer(repository, reader(0, 0)).publishReviewCreated(event);
    assert.deepEqual(repository.getUser(event.revieweeId), { ...row(), ratingAverage: null, reviewCount: 0 });
  });
  await test(group, "UR-02: 소수 둘째 자리 반올림과 저장 건수 상한을 지킨다", async () => {
    for (const [ratingSum, reviewCount, expected] of [[489, 110, 4.45], [201, 200, 1.01], [5, 1, 5], [2_147_483_647, 2_147_483_647, 1]]) {
      const repository = new InMemoryUserRatingRepository([row()]);
      await createReviewCreatedConsumer(repository, reader(ratingSum, reviewCount)).publishReviewCreated(event);
      assert.equal(repository.getUser(event.revieweeId)?.ratingAverage, expected);
    }
  });
  await test(group, "UR-03: 중복·역순 이벤트도 현재 집계로 대체하며 누적하지 않는다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    let ratingSum = 10; let reviewCount = 2;
    const consumer = createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate() { return { ratingSum, reviewCount }; } });
    await consumer.publishReviewCreated(event);
    await consumer.publishReviewCreated(event);
    assert.equal(repository.getUser(event.revieweeId)?.reviewCount, 2);
    ratingSum = 11; reviewCount = 3;
    await consumer.publishReviewCreated({ ...event, reviewId: "rvw_older", publishedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(repository.getUser(event.revieweeId)?.reviewCount, 3);
    assert.equal(repository.getUser(event.revieweeId)?.ratingAverage, 3.67);
  });
  await test(group, "UR-03: 소비자 인스턴스 둘도 같은 사용자 집계부터 커밋까지 직렬화한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    const started = deferred(); const release = deferred(); let reads = 0;
    const ratings: PublishedRatingAggregateReader = { async getPublishedRatingAggregate() {
      reads += 1;
      if (reads === 1) { started.resolve(); await release.promise; return { ratingSum: 5, reviewCount: 1 }; }
      return { ratingSum: 6, reviewCount: 2 };
    } };
    const first = createReviewCreatedConsumer(repository, ratings).publishReviewCreated(event);
    await started.promise;
    const second = createReviewCreatedConsumer(repository, ratings).publishReviewCreated({ ...event, reviewId: "rvw_second" });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(reads, 1);
    assert.deepEqual(repository.getUser(event.revieweeId), row());
    release.resolve();
    await Promise.all([first, second]);
    assert.equal(reads, 2);
    assert.deepEqual(repository.getUser(event.revieweeId), { ...row(), ratingAverage: 3, reviewCount: 2 });
  });
  await test(group, "UR-03: 다른 사용자는 느린 사용자 집계에 막히지 않는다", async () => {
    const repository = new InMemoryUserRatingRepository([row(), row("usr_other")]);
    const started = deferred(); const release = deferred();
    const consumer = createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate(userId) {
      if (userId === event.revieweeId) { started.resolve(); await release.promise; }
      return { ratingSum: 5, reviewCount: 1 };
    } });
    const first = consumer.publishReviewCreated(event); await started.promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        consumer.publishReviewCreated({ ...event, revieweeId: "usr_other" }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("다른 사용자 잠금 대기")), 1000); }),
      ]);
      assert.equal(repository.getUser("usr_other")?.ratingAverage, 5);
    } finally { clearTimeout(timer); release.resolve(); await first; }
  });
  await test(group, "UR-04: 알 수 없거나 탈퇴한 사용자는 집계·생성·갱신하지 않는다", async () => {
    for (const seeds of [[], [{ ...row(), deletedAt: "2026-09-01T00:00:00Z" }]]) {
      const repository = new InMemoryUserRatingRepository(seeds); let called = false;
      await assert.rejects(createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate() { called = true; return { ratingSum: 5, reviewCount: 1 }; } }).publishReviewCreated(event), matches("USER_UNAVAILABLE", false));
      assert.equal(called, false);
      assert.deepEqual(repository.getUser(event.revieweeId), seeds[0] ?? null);
    }
  });
  await test(group, "UR-04: 잠금 대상과 다른 사용자 또는 비정상 탈퇴 자료를 거절한다", async () => {
    for (const subject of [{ userId: "usr_other", deletedAt: null }, { userId: event.revieweeId }, false]) {
      let writes = 0;
      const repository: UserRatingRepository = { async withUserRatingTransaction(_userId, action) {
        return action({ async findUser() { return subject as never; }, async replaceRating() { writes += 1; } });
      } };
      await assert.rejects(createReviewCreatedConsumer(repository, reader(5, 1)).publishReviewCreated(event), matches("USER_UNAVAILABLE", false));
      assert.equal(writes, 0);
    }
  });
  await test(group, "UR-01: 불량 이벤트는 저장소에 닿기 전에 영구 실패한다", async () => {
    const invalid: unknown[] = [null, {}, { ...event, reviewId: "" }, { ...event, projectId: "prj bad" }, { ...event, revieweeId: "usr_\u0000" }, ...[0, 6, 1.1, NaN, Infinity, "5"].map((rating) => ({ ...event, rating })), ...["bad", "2026-02-30T00:00:00Z", "2026-09-08T00:00:00+00:00", "2026-09-08T00:00:00.12Z"].map((publishedAt) => ({ ...event, publishedAt }))];
    let calls = 0;
    const repository: UserRatingRepository = { async withUserRatingTransaction() { calls += 1; throw new Error("금지"); } };
    for (const candidate of invalid) await assert.rejects(createReviewCreatedConsumer(repository, reader(5, 1)).publishReviewCreated(candidate as ReviewCreatedEvent), matches("INVALID_REVIEW_EVENT", false));
    assert.equal(calls, 0);
  });
  await test(group, "UR-01: 과거 이벤트·윤년 시각·기존 긴 식별자는 정확히 전달한다", async () => {
    const userId = "usr_0123456789abcdef0123456789abcdef";
    const repository = new InMemoryUserRatingRepository([row(userId)]);
    await createReviewCreatedConsumer(repository, reader(5, 1)).publishReviewCreated({ ...event, revieweeId: userId, publishedAt: "2024-02-29T12:13:14.123Z" });
    assert.equal(repository.getUser(userId)?.ratingAverage, 5);
  });
  await test(group, "UR-05: 비정상 집계는 캐시를 보존하고 재시도 신호를 반환한다", async () => {
    const invalid: unknown[] = [null, {}, { ratingSum: 1, reviewCount: 0 }, { ratingSum: 0, reviewCount: 1 }, { ratingSum: 6, reviewCount: 1 }, { ratingSum: 1.5, reviewCount: 1 }, { ratingSum: 5, reviewCount: 1.5 }, { ratingSum: NaN, reviewCount: 1 }, { ratingSum: Infinity, reviewCount: 1 }, { ratingSum: 2_147_483_648, reviewCount: 2_147_483_648 }, { ratingSum: -1, reviewCount: -1 }];
    for (const aggregate of invalid) {
      const repository = new InMemoryUserRatingRepository([row()]);
      await assert.rejects(createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate() { return aggregate as never; } }).publishReviewCreated(event), matches("INVALID_RATING_AGGREGATE", true));
      assert.deepEqual(repository.getUser(event.revieweeId), row());
    }
  });
  await test(group, "UR-05: 집계 실패는 내부 오류를 숨기고 재시도 때 최신 값으로 회복한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]); let failing = true;
    const consumer = createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate() { if (failing) throw new Error("비공개 저장소 상세"); return { ratingSum: 9, reviewCount: 2 }; } });
    await assert.rejects(consumer.publishReviewCreated(event), (error: unknown) => matches("DEPENDENCY_UNAVAILABLE", true)(error) && !(error as Error).message.includes("비공개"));
    assert.deepEqual(repository.getUser(event.revieweeId), row()); failing = false;
    await consumer.publishReviewCreated(event);
    assert.equal(repository.getUser(event.revieweeId)?.ratingAverage, 4.5);
  });
  await test(group, "UR-05: 커밋 실패는 두 필드를 함께 되돌리고 재전달을 허용한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]); repository.failNextCommit();
    const consumer = createReviewCreatedConsumer(repository, reader(9, 2));
    await assert.rejects(consumer.publishReviewCreated(event), matches("DEPENDENCY_UNAVAILABLE", true));
    assert.deepEqual(repository.getUser(event.revieweeId), row());
    await consumer.publishReviewCreated(event);
    assert.deepEqual(repository.getUser(event.revieweeId), { ...row(), ratingAverage: 4.5, reviewCount: 2 });
  });
  await test(group, "UR-05: 저장소 잠금 진입 실패도 재시도 가능한 실패다", async () => {
    const repository: UserRatingRepository = { async withUserRatingTransaction() { throw new Error("잠금 장애"); } };
    await assert.rejects(createReviewCreatedConsumer(repository, reader(5, 1)).publishReviewCreated(event), matches("DEPENDENCY_UNAVAILABLE", true));
  });
  await test(group, "UR-03·04: 탈퇴도 같은 잠금으로 직렬화하며 이후 이벤트는 거부한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    const started = deferred(); const release = deferred();
    const consumer = createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate() { started.resolve(); await release.promise; return { ratingSum: 5, reviewCount: 1 }; } });
    const pending = consumer.publishReviewCreated(event); await started.promise;
    const deletion = repository.softDeleteUser(event.revieweeId, event.publishedAt);
    release.resolve(); await Promise.all([pending, deletion]);
    await assert.rejects(consumer.publishReviewCreated(event), matches("USER_UNAVAILABLE", false));
    assert.equal(repository.getUser(event.revieweeId)?.deletedAt, event.publishedAt);
  });
  await test(group, "UR-06: 입력·조회 자료를 복제하고 완료된 트랜잭션은 재사용할 수 없다", async () => {
    const seed = row(); const repository = new InMemoryUserRatingRepository([seed]); seed.ratingAverage = 1;
    repository.getUser(event.revieweeId)!.ratingAverage = 1;
    let escaped!: UserRatingTransaction;
    await repository.withUserRatingTransaction(event.revieweeId, async (transaction) => { escaped = transaction; });
    await assert.rejects(escaped.findUser());
    await assert.rejects(escaped.replaceRating({ ratingAverage: 5, reviewCount: 1 }));
    assert.deepEqual(repository.getUser(event.revieweeId), row());
  });
  await test(group, "UR-06: 쓰기 예약 뒤 콜백 오류도 롤백하고 잠금을 해제한다", async () => {
    const repository = new InMemoryUserRatingRepository([row()]);
    await assert.rejects(repository.withUserRatingTransaction(event.revieweeId, async (transaction) => {
      await transaction.replaceRating({ ratingAverage: 5, reviewCount: 10 }); throw new Error("콜백 실패");
    }));
    assert.deepEqual(repository.getUser(event.revieweeId), row());
    await createReviewCreatedConsumer(repository, reader(5, 1)).publishReviewCreated(event);
    assert.equal(repository.getUser(event.revieweeId)?.ratingAverage, 5);
  });
  await test(group, "UR-06: 전달 중 이벤트 변경은 잠금·집계·쓰기의 대상에 영향을 주지 않는다", async () => {
    const repository = new InMemoryUserRatingRepository([row(), row("usr_other")]);
    const mutable = { ...event }; const started = deferred(); const release = deferred();
    const pending = createReviewCreatedConsumer(repository, { async getPublishedRatingAggregate(userId) {
      assert.equal(userId, event.revieweeId); started.resolve(); await release.promise; return { ratingSum: 5, reviewCount: 1 };
    } }).publishReviewCreated(mutable);
    await started.promise; mutable.revieweeId = "usr_other"; release.resolve(); await pending;
    assert.equal(repository.getUser(event.revieweeId)?.ratingAverage, 5);
    assert.equal(repository.getUser("usr_other")?.ratingAverage, 2);
  });
}
