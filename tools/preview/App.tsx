import { useState, useEffect, useMemo } from 'react';

// features/{기능}/prototype/web/index.tsx를 전부 찾아서 화면에서 고를 수 있게 한다.
// 각 기능 담당자는 prototype/web/index.tsx에서 화면 컴포넌트를 default export하기만 하면,
// 이 프리뷰 화면에 자동으로 나타난다 (feature-workflow.md DoD 참고).
const modules = import.meta.glob<{ default: React.ComponentType }>(
  '../../features/*/prototype/web/index.tsx'
);

function featureNameFromPath(p: string): string {
  const match = p.match(/features\/([^/]+)\/prototype/);
  return match ? match[1] : p;
}

export function App() {
  const features = useMemo(
    () => Object.keys(modules).map(featureNameFromPath).sort(),
    []
  );
  const [selected, setSelected] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('feature');
    return fromUrl && features.includes(fromUrl) ? fromUrl : null;
  });
  const [Comp, setComp] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    if (!selected) {
      setComp(null);
      return;
    }
    const entry = Object.entries(modules).find(
      ([p]) => featureNameFromPath(p) === selected
    );
    if (!entry) return;
    entry[1]().then((mod) => setComp(() => mod.default));
  }, [selected]);

  function select(name: string) {
    setSelected(name);
    const url = new URL(window.location.href);
    url.searchParams.set('feature', name);
    window.history.pushState({}, '', url);
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 240, borderRight: '1px solid #ddd', padding: '1rem', background: '#fff' }}>
        <h2 style={{ fontSize: 14, color: '#888', marginTop: 0 }}>features/*/prototype/web</h2>
        {features.length === 0 && (
          <p style={{ fontSize: 13, color: '#aaa' }}>
            prototype/web/index.tsx가 있는 기능이 아직 없습니다.
          </p>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {features.map((name) => (
            <li key={name}>
              <button
                onClick={() => select(name)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '.5rem',
                  marginBottom: '.25rem',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: selected === name ? '#333' : 'transparent',
                  color: selected === name ? '#fff' : '#333',
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main style={{ flex: 1, padding: '2rem' }}>
        {!selected && <p style={{ color: '#999' }}>왼쪽에서 기능을 선택하세요.</p>}
        {selected && !Comp && <p style={{ color: '#999' }}>불러오는 중...</p>}
        {Comp && (
          <div style={{ maxWidth: 420 }}>
            <Comp />
          </div>
        )}
      </main>
    </div>
  );
}
