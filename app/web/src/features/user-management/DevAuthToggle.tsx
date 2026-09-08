import { useEffect, useRef, useState } from 'react';
import { http } from '../../shared/http';
import type { DevMockRole } from './useAuth';
import { devMockRoleForToken, getAccessTokenInMemory } from './useAuth';

/**
 * 로컬 개발 전용 — 로그인 화면 없이 세션을 바로 켜고 끄는 토글. 두 가지를 지원한다.
 *
 *   1. mock 세션(기존, 2026-09-07) — app/server가 `AUTH_PROVIDER_MODE=mock`일 때만 통하는
 *      고정 토큰 두 개(auth.mock.ts)로 바로 갈아 끼운다.
 *   2. 시드 계정 피커(신규, 2026-09-08) — `AUTH_PROVIDER_MODE=supabase`로 띄운 로컬 서버에서,
 *      `scripts/seed-dev-accounts.js`가 만들어 둔 "기능별로 이미 상태를 갖춘" 실제 계정
 *      목록을 `GET /api/internal/dev/test-accounts`(서버가 `!isProduction`일 때만 여는
 *      dev 전용 엔드포인트, express-app.ts 참고)로 받아와 목록으로 보여준다. 클릭하면
 *      실제 `POST /api/v1/auth/sessions`(로그인)를 그대로 호출한다 — mock과 달리 서버가
 *      진짜 세션으로 인식한다.
 *
 * `App.tsx`가 `import.meta.env.DEV`일 때만 이 컴포넌트를 렌더한다 — 프로덕션 빌드에는 이
 * 컴포넌트도, mock 세션 상수도, 시드 계정 fetch도 죽은 코드로 빠진다. 시드 계정 목록
 * 엔드포인트 자체도 서버가 프로덕션이면 존재하지 않으므로(express-app.ts) 실수로 배포돼도
 * 빈 목록만 돌아온다 — 이중 방어.
 *
 * 2026-09-08 — 화면 테스트 중 지저분해 보이지 않도록 드래그 이동과 닫기(최소 배지로 접기)를
 * 추가했다. 위치는 `localStorage`에 저장한다 — 이 앱은 Claude 프리뷰 아티팩트가 아니라
 * 사용자 브라우저에서 그대로 도는 실제 앱이라 브라우저 저장소 제약이 없다.
 */
export type DevAuthToggleProps = {
  viewer: { userId: string; role: DevMockRole | 'CLIENT' | 'FREELANCER'; email: string } | null;
  onSelectRole: (role: DevMockRole) => void;
  onClear: () => void;
  /** 시드 계정 하나를 실제 로그인으로 전환한다 (App.tsx가 `useAuth().login`을 그대로 넘긴다). */
  onLoginAsSeedAccount: (email: string, password: string) => Promise<unknown>;
};

type SeedAccount = {
  key: string;
  label: string;
  feature: string;
  description: string;
  role: 'CLIENT' | 'FREELANCER';
  email: string;
  password: string;
  userId: string;
};

const ROLE_LABEL: Record<DevMockRole, string> = { CLIENT: '의뢰인', FREELANCER: '프리랜서' };

const POSITION_STORAGE_KEY = 'pactfive-dev-toggle-position';

type Position = { right: number; bottom: number };

function loadStoredPosition(): Position {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return { right: 16, bottom: 16 };
    const parsed = JSON.parse(raw) as Partial<Position>;
    return {
      right: typeof parsed.right === 'number' ? parsed.right : 16,
      bottom: typeof parsed.bottom === 'number' ? parsed.bottom : 16,
    };
  } catch {
    return { right: 16, bottom: 16 };
  }
}

function useSeedAccounts() {
  const [accounts, setAccounts] = useState<SeedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // shared/http.ts를 거친다(app/web/AGENTS.md "폴더 간 접점") — 인증 헤더는 필요 없으므로
    // skipAuth. 서버가 프로덕션이면 이 경로 자체가 없어(express-app.ts) 404가 나고, 그때도
    // 위젯은 "계정 없음" 문구로 조용히 접힌다.
    http
      .get<{ accounts: SeedAccount[] }>('/internal/dev/test-accounts', { skipAuth: true })
      .then((data) => {
        if (!cancelled) setAccounts(data.accounts ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('시드 계정 목록을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { accounts, error };
}

/** feature 문자열(예: "contracts-payments (합의)") 기준으로 묶는다. */
function groupByFeature(accounts: SeedAccount[]): Array<[string, SeedAccount[]]> {
  const groups = new Map<string, SeedAccount[]>();
  for (const account of accounts) {
    const list = groups.get(account.feature) ?? [];
    list.push(account);
    groups.set(account.feature, list);
  }
  return Array.from(groups.entries());
}

export function DevAuthToggle({ viewer, onSelectRole, onClear, onLoginAsSeedAccount }: DevAuthToggleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState<Position>(() => loadStoredPosition());
  const [loggingInKey, setLoggingInKey] = useState<string | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startPos: Position } | null>(null);

  const { accounts, error: seedAccountsError } = useSeedAccounts();

  const activeMockRole = devMockRoleForToken(getAccessTokenInMemory());
  const isRealSession = viewer !== null && activeMockRole === null;

  useEffect(() => {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  }, [position]);

  function startDrag(event: React.PointerEvent) {
    // 버튼 클릭까지 드래그로 잡아채지 않도록, 핸들 영역에서만 호출된다(아래 렌더 참고).
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragState.current = { startX: event.clientX, startY: event.clientY, startPos: position };
  }

  function onDrag(event: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    const next: Position = {
      right: Math.max(4, dragState.current.startPos.right - dx),
      bottom: Math.max(4, dragState.current.startPos.bottom - dy),
    };
    setPosition(next);
  }

  function endDrag() {
    dragState.current = null;
  }

  async function handleSeedLogin(account: SeedAccount) {
    setLoggingInKey(account.key);
    try {
      await onLoginAsSeedAccount(account.email, account.password);
    } catch {
      // 실패해도(예: 서버가 supabase 모드가 아님) useAuth 쪽 상태 문구로 이미 드러난다 —
      // 여기서 추가로 alert를 띄우면 이중 안내라 생략한다.
    } finally {
      setLoggingInKey(null);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        style={{ ...widgetBase(position), padding: '6px 10px', fontSize: 12 }}
        aria-label="DEV 로그인 위젯 펼치기"
      >
        DEV
      </button>
    );
  }

  return (
    <div style={{ ...widgetBase(position), width: 260, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          cursor: 'grab',
          touchAction: 'none',
          borderBottom: '1px solid var(--border)',
        }}
        title="드래그해서 옮길 수 있습니다"
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', letterSpacing: '.04em' }}>
          ⠿ DEV 로그인 위젯
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--content-tertiary)', fontSize: 12 }}
          aria-label="닫기"
        >
          닫기
        </button>
      </div>

      <div style={{ padding: 12, overflowY: 'auto' }}>
        <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--content-secondary)', margin: '0 0 10px' }}>
          {isRealSession
            ? `실제 로그인 유지 중: ${viewer.email}`
            : activeMockRole
              ? `mock ${ROLE_LABEL[activeMockRole]}로 로그인됨`
              : '비로그인'}
        </p>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--content-tertiary)', margin: '0 0 6px' }}>
          mock 세션 (AUTH_PROVIDER_MODE=mock 전용)
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {(['CLIENT', 'FREELANCER'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => onSelectRole(role)}
              disabled={activeMockRole === role}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 6,
                border: '1px solid var(--action)',
                background: activeMockRole === role ? 'var(--action)' : 'var(--surface)',
                color: activeMockRole === role ? 'var(--action-text)' : 'var(--action-secondary-text)',
                fontSize: 12,
                fontWeight: 600,
                cursor: activeMockRole === role ? 'default' : 'pointer',
              }}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={activeMockRole === null}
          style={{
            width: '100%',
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--content-secondary)',
            fontSize: 12,
            cursor: activeMockRole === null ? 'default' : 'pointer',
            marginBottom: 12,
          }}
        >
          mock 로그아웃
        </button>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--content-tertiary)', margin: '0 0 6px' }}>
          시드 계정 (AUTH_PROVIDER_MODE=supabase 전용)
        </div>
        {accounts === null && !seedAccountsError && (
          <p style={{ fontSize: 12, color: 'var(--content-tertiary)' }}>불러오는 중...</p>
        )}
        {seedAccountsError && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{seedAccountsError}</p>}
        {accounts !== null && accounts.length === 0 && (
          <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--content-tertiary)' }}>
            시드 계정이 없습니다. 리포 루트에서 <code>npm run seed:dev-accounts</code>를 실행하세요.
          </p>
        )}
        {accounts !== null && accounts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groupByFeature(accounts).map(([feature, group]) => (
              <div key={feature}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--content-secondary)', marginBottom: 4 }}>
                  {feature}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.map((account) => {
                    const isActive = viewer?.userId === account.userId;
                    return (
                      <button
                        key={account.key}
                        type="button"
                        onClick={() => void handleSeedLogin(account)}
                        disabled={isActive || loggingInKey === account.key}
                        title={account.description}
                        style={{
                          textAlign: 'left',
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: isActive ? 'var(--action)' : 'var(--surface)',
                          color: isActive ? 'var(--action-text)' : 'var(--content-secondary)',
                          fontSize: 12,
                          cursor: isActive ? 'default' : 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{account.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                          {loggingInKey === account.key ? '로그인 중...' : account.email}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function widgetBase(position: Position): React.CSSProperties {
  return {
    position: 'fixed',
    right: position.right,
    bottom: position.bottom,
    zIndex: 9999,
    background: 'var(--surface)',
    border: '1px solid var(--warning)',
    borderRadius: 'var(--card-radius)',
    boxShadow: '0 4px 16px rgba(0,0,0,.16)',
    fontFamily: 'var(--font)',
  };
}
