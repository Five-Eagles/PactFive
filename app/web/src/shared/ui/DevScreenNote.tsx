import type { NotYetScreenKey } from '../notYetScreens';
import { DEV_SCREEN_NOTES } from '../notYetScreens.dev';

/**
 * 준비 중 화면의 **개발자용** 메모 — 담당과 명세 위치.
 *
 * 개발 중(`npm run dev`)에만 그린다. 배포본에는 나오지 않는다.
 *
 * 왜 나누는가: 방문자에게 "담당 미정"·`features/applications/` 같은 말은 아무 의미가 없다.
 * 우리 팀에게만 쓸모 있는 정보가 배포된 화면에 그대로 뜨면, 준비 중이라는 안내가 아니라
 * **내부 문서가 새어 나온 것처럼 보인다.** 정보를 버리지는 않는다 — 볼 사람에게만 보인다.
 */
export function DevScreenNote({ screenKey }: { screenKey: NotYetScreenKey }) {
  if (!import.meta.env.DEV) return null;

  const screen = DEV_SCREEN_NOTES[screenKey];
  return (
    <dl
      className="caption"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '6px 16px',
        margin: '16px 0 0',
        paddingTop: 12,
        borderTop: '1px solid var(--border-subtle, #e5e7eb)',
      }}
    >
      <dt style={{ fontWeight: 700 }}>담당</dt>
      <dd style={{ margin: 0 }}>{screen.owner}</dd>
      <dt style={{ fontWeight: 700 }}>명세</dt>
      <dd style={{ margin: 0 }}>
        <code>{screen.where}</code>
      </dd>
      {screen.note && (
        <>
          <dt style={{ fontWeight: 700 }}>메모</dt>
          <dd style={{ margin: 0 }}>{screen.note}</dd>
        </>
      )}
    </dl>
  );
}
