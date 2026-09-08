import { useState } from 'react';
import type { DevMockRole } from './useAuth';
import { devMockRoleForToken, getAccessTokenInMemory } from './useAuth';

/**
 * 로컬 개발 전용 — 로그인 화면 없이 CLIENT/FREELANCER mock 세션을 바로 켜고 끄는 토글.
 *
 * 왜 필요한지: 로컬 `npm run dev`는 app/server의 `AUTH_PROVIDER_MODE`가 기본 `mock`이라
 * `requireAuth`가 고정 토큰 두 개(auth.mock.ts)만 인정하는데, 실제 로그인 화면을 통과해도
 * 거기서 나오는 토큰은 이 고정 토큰과 다르다 — 로그인 화면 자체가 로컬 테스트에는 쓸모가
 * 없다. `useAuth.ts`의 `devLoginAsMock`/`devLogoutMock`이 그 고정 토큰으로 직접 갈아
 * 끼운다. 이 컴포넌트는 그 두 함수를 누를 수 있는 버튼으로만 노출한다.
 *
 * App.tsx가 `import.meta.env.DEV`일 때만 이 컴포넌트를 렌더한다 — 프로덕션 빌드에는 이
 * 컴포넌트도, 아래에서 참조하는 `useAuth.ts`의 mock 세션 상수도 죽은 코드로 빠진다.
 *
 * Supabase 등 실제 인증으로 배포된 환경(`AUTH_PROVIDER_MODE≠mock`)에서 실수로 켜져도, 이
 * 토큰은 그쪽 서버가 세션으로 인식하지 못해 보호된 API가 401을 낼 뿐이다 — 아래 계정 정보
 * 유출이나 권한 상승 같은 위험은 없다. 그래도 이중 방어로 `import.meta.env.DEV` 게이트를
 * 유지한다.
 */
export type DevAuthToggleProps = {
  viewer: { userId: string; role: DevMockRole | 'CLIENT' | 'FREELANCER'; email: string } | null;
  onSelectRole: (role: DevMockRole) => void;
  onClear: () => void;
};

const ROLE_LABEL: Record<DevMockRole, string> = { CLIENT: '의뢰인', FREELANCER: '프리랜서' };

export function DevAuthToggle({ viewer, onSelectRole, onClear }: DevAuthToggleProps) {
  const [collapsed, setCollapsed] = useState(false);

  const activeMockRole = devMockRoleForToken(getAccessTokenInMemory());
  const isRealSession = viewer !== null && activeMockRole === null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        style={{ ...WIDGET_BASE, padding: '6px 10px', fontSize: 12 }}
        aria-label="DEV 로그인 토글 펼치기"
      >
        DEV
      </button>
    );
  }

  return (
    <div style={{ ...WIDGET_BASE, padding: 12, width: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', letterSpacing: '.04em' }}>
          DEV 로그인 토글
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--content-tertiary)', fontSize: 12 }}
          aria-label="접기"
        >
          접기
        </button>
      </div>

      <p style={{ fontSize: 12, lineHeight: '16px', color: 'var(--content-secondary)', margin: '0 0 10px' }}>
        {isRealSession
          ? `실제 로그인 유지 중: ${viewer.email}`
          : activeMockRole
            ? `mock ${ROLE_LABEL[activeMockRole]}로 로그인됨`
            : '비로그인'}
      </p>

      <div style={{ display: 'flex', gap: 6 }}>
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
          marginTop: 6,
          width: '100%',
          height: 28,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--content-secondary)',
          fontSize: 12,
          cursor: activeMockRole === null ? 'default' : 'pointer',
        }}
      >
        mock 로그아웃
      </button>
    </div>
  );
}

const WIDGET_BASE: React.CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 9999,
  background: 'var(--surface)',
  border: '1px solid var(--warning)',
  borderRadius: 'var(--card-radius)',
  boxShadow: '0 4px 16px rgba(0,0,0,.16)',
  fontFamily: 'var(--font)',
};
