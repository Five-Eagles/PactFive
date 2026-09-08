/**
 * 프로젝트 행을 잠근 뒤 콜백을 실행한다 — 서명·무효화 등 같은 프로젝트에 대한 동시 요청이
 * 겹치지 않게 직렬화한다(F01, spec.md 규칙 12·25). 실제 DB 행 잠금(`SELECT ... FOR UPDATE`)의
 * 자리표시자이며, 실구현(Prisma 트랜잭션 전환) 소유는 project-management(유동우)다.
 *
 * 원본: features/contracts-payments/prototype/server/project-guard.ts (28471d6, #80).
 */
const tails = new Map<string, Promise<unknown>>();

export async function withActiveProjectGuard<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(projectId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    projectId,
    previous.then(
      () => gate,
      () => gate,
    ),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}
