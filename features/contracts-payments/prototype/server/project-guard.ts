/** 프로젝트 행을 잠근 뒤 콜백을 실행한다. 실구현 소유는 유동우다. */
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
