/**
 * 등록 입력을 브라우저에 보존한다
 *
 * 원본: features/project-management/prototype/web/useDraft.ts (de5a001, CR-0006 결함 3)
 *
 * `ux-philosophy.md` §6 "작업 보호 — 실패, 이동, 재인증 이후에도 입력과 맥락이 유지된다"
 * 를 충족하기 위한 것이다.
 *
 * ## 왜 브라우저인가
 *
 * spec.md 규칙 1 이 **"서버에는 마지막 단계에서 한 번만 저장한다. 중간 단계를 서버에 임시
 * 저장하지 않는다"** 로 정해져 있다. 서버로는 못 푼다.
 *
 * 규칙 1 이 금지한 것은 **서버 저장**이다. 브라우저에 두는 것은 금지 대상이 아니고,
 * 다른 기기·다른 사람에게 보이지도 않는다.
 *
 * ## 왜 sessionStorage 인가
 *
 * `localStorage` 는 탭을 닫아도 남는다. 공용 PC 에서 다음 사람이 남의 프로젝트
 * 초안을 보게 된다. `sessionStorage` 는 탭 단위라 그 위험이 없고, 새로고침·뒤로 가기
 * 라는 실제 사고는 그대로 막는다.
 *
 * ## 언제 지우는가
 *
 * 등록에 성공하면 지운다. 사용자가 명시적으로 버려도 지운다.
 * **자동으로 만료시키지 않는다** — 사용자가 모르는 사이에 입력이 사라지는 것이
 * 이 훅이 막으려던 바로 그 일이다.
 */

import { useCallback, useState } from 'react';

const PREFIX = 'pactfive:draft:';

/** 저장된 값에 형식을 붙여 둔다. 나중에 필드가 바뀌면 옛 초안을 버릴 수 있다 */
type Envelope<T> = { version: number; savedAt: string; value: T };

export type DraftStore = {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
};

/**
 * 브라우저가 없는 환경(서버 렌더링·테스트)에서도 안전해야 한다.
 * `sessionStorage` 접근 자체가 예외를 던지는 브라우저 설정이 있어 전부 감싼다.
 */
export const sessionDraftStore: DraftStore = {
  read(key) {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, value);
    } catch {
      // 저장에 실패해도 입력을 막지 않는다. 보존은 편의지 필수가 아니다.
    }
  },
  remove(key) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key);
    } catch {
      /* 위와 같다 */
    }
  },
};

export type UseDraftOptions<T> = {
  /** 무엇의 초안인가. `project-register` 처럼 화면을 가리킨다 */
  name: string;
  /** 필드 구성이 바뀌면 올린다. 옛 초안은 버려진다 */
  version: number;
  initial: T;
  store?: DraftStore;
};

export type UseDraftResult<T> = {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  /** 저장된 초안을 불러왔는가. 사용자에게 알려야 한다 */
  restored: boolean;
  /** 언제 저장된 것인가 */
  restoredAt: string | null;
  /** 초안을 버리고 처음부터 */
  discard: () => void;
  /** 등록에 성공했을 때 */
  clear: () => void;
};

export function useDraft<T>({
  name,
  version,
  initial,
  store = sessionDraftStore,
}: UseDraftOptions<T>): UseDraftResult<T> {
  const key = PREFIX + name;

  /**
   * **첫 상태를 만들 때 읽는다.** `useEffect` 로 미루면 빈 폼이 한 번 그려진 뒤
   * 값이 들어와 화면이 튄다. 저장소 읽기는 동기라 미룰 이유가 없다.
   *
   * 이 앱은 브라우저에서만 그린다(Vite SPA). 서버 렌더링을 하게 되면
   * 초기값이 서버·브라우저에서 달라지므로 그때 이 방식을 다시 봐야 한다.
   */
  function load(): { value: T; restoredAt: string | null } {
    const raw = store.read(key);
    if (!raw) return { value: initial, restoredAt: null };

    try {
      const env = JSON.parse(raw) as Envelope<T>;
      // 필드 구성이 바뀌었으면 옛 초안을 되살리지 않는다.
      // 되살리면 없는 칸에 값이 들어가거나 새 칸이 비어 더 헷갈린다.
      if (env.version !== version) {
        store.remove(key);
        return { value: initial, restoredAt: null };
      }
      return { value: env.value, restoredAt: env.savedAt };
    } catch {
      // 깨진 값이면 조용히 버린다. 사용자가 할 수 있는 것이 없다.
      store.remove(key);
      return { value: initial, restoredAt: null };
    }
  }

  const [loaded] = useState(load);
  const [value, setRaw] = useState<T>(loaded.value);
  const [restored, setRestored] = useState(loaded.restoredAt !== null);
  const [restoredAt, setRestoredAt] = useState<string | null>(loaded.restoredAt);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setRaw((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        const env: Envelope<T> = {
          version,
          savedAt: new Date().toISOString(),
          value: resolved,
        };
        store.write(key, JSON.stringify(env));
        return resolved;
      });
      // 사용자가 다시 입력하기 시작하면 "복원했다" 안내는 역할이 끝난다.
      setRestored(false);
    },
    [key, version, store],
  );

  const discard = useCallback(() => {
    store.remove(key);
    setRaw(initial);
    setRestored(false);
    setRestoredAt(null);
  }, [key, initial, store]);

  const clear = useCallback(() => {
    store.remove(key);
    setRestored(false);
    setRestoredAt(null);
  }, [key, store]);

  return { value, setValue, restored, restoredAt, discard, clear };
}
