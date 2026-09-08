const tails = new Map<string, Promise<unknown>>();

/** 키별로 한 번에 하나만 실행한다. */
export async function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    key,
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
