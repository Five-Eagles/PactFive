import type { ReactNode } from 'react';
import '../home/home.css';
import './info.css';
import { InfoBand } from './InfoBand';

/**
 * 안전한 거래 (시안 `design/reference-proposal/guide.html` 의 `#safety` 절).
 *
 * **준비 중 화면이 아니다.** 이미 정해진 규칙을 설명할 뿐이라 서버가 필요 없다.
 *
 * 네 가지 모두 **어디서 온 규칙인지 밝힌다.** 근거를 적어 두면 두 가지가 생긴다 —
 * 읽는 사람은 빈말이 아님을 알고, 우리는 규칙이 바뀔 때 이 화면도 고쳐야 한다는 것을 안다.
 * 근거 없는 약속은 여기 적지 않는다.
 */
export function SafetyPage() {
  return (
    <>
      <InfoBand current="safety" />

      <div className="if-page">
        <section className="if-sec">
          <h2>안전한 거래</h2>
          <p className="if-lede">
            돈과 약속이 오가는 곳이라 되돌릴 수 없는 일이 생기지 않도록 네 가지를 정해
            두었습니다.
          </p>

          <ul className="if-safe">
            {GUARDS.map((g) => (
              <li key={g.title}>
                <article className="card">
                  <span className="if-safe__ico">{g.icon}</span>
                  <span>
                    <h3>{g.title}</h3>
                    <p>{g.body}</p>
                    <span className="if-safe__src">{g.src}</span>
                  </span>
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/**
 * 아이콘은 시안 그대로다. 세 겹으로 그린다 —
 * `plate`(뒤로 물러난 면) · `fill`(반쯤 채운 면) · `ln`(앞의 선).
 */
const shield: ReactNode = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path className="if-plate" d="M12 2.2 20 5.4v6.1c0 4.6-3.3 8.2-8 9.7-4.7-1.5-8-5.1-8-9.7V5.4z" />
    <path className="if-fill" d="M12 2.2 20 5.4v6.1c0 .5 0 1-.1 1.4H12z" />
    <path className="if-ln" d="M12 2.2 20 5.4v6.1c0 4.6-3.3 8.2-8 9.7-4.7-1.5-8-5.1-8-9.7V5.4z" />
    <path className="if-ln" d="M8.6 11.6 11 14 15.6 9.4" />
  </svg>
);

const doc: ReactNode = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path
      className="if-plate"
      d="M5 2.6h8.6L19.4 8v13.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z"
    />
    <path className="if-fill" d="M13.6 2.6 19.4 8h-5.8z" />
    <path
      className="if-ln"
      d="M5 2.6h8.6L19.4 8v13.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z"
    />
    <path className="if-ln" d="M13.6 2.6 19.4 8h-5.8z" />
    <path
      className="if-ln"
      d="M7.6 17.4c1.9-2.4 2.9-4.3 2.9-5.7 0-1.2-1.4-1.1-1.4.2 0 2.3 3.3 6.1 4.8 6.1.9 0 1.4-.5 1.4-1"
    />
  </svg>
);

const lock: ReactNode = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <rect className="if-plate" x="3.5" y="10" width="17" height="11" rx="2.4" />
    <rect className="if-fill" x="3.5" y="10" width="17" height="4" rx="2.4" />
    <rect className="if-ln" x="3.5" y="10" width="17" height="11" rx="2.4" />
    <path className="if-ln" d="M7.6 10V7.2a4.4 4.4 0 0 1 8.8 0V10" />
    <path className="if-ln" d="M12 14.6v2.8" />
  </svg>
);

const clock: ReactNode = (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="if-plate" cx="12" cy="12" r="9.2" />
    <path className="if-fill" d="M12 2.8a9.2 9.2 0 0 1 9.2 9.2H12z" />
    <circle className="if-ln" cx="12" cy="12" r="9.2" />
    <path className="if-ln" d="M12 6.8V12l3.4 2" />
  </svg>
);

const GUARDS = [
  {
    icon: shield,
    title: '결제한 금액은 보관됩니다',
    body: '결제해도 바로 넘어가지 않습니다. 납품을 확인하고 승인한 뒤에 정산됩니다. 승인 전에는 어느 쪽도 임의로 가져갈 수 없습니다.',
    src: '에스크로 결제 · PRD §5.2',
  },
  {
    icon: doc,
    title: '합의한 금액이 그대로 계약서가 됩니다',
    body: '따로 옮겨 적지 않으므로 금액이 어긋날 일이 없습니다. 제안·수정·수락이 모두 기록으로 남아 나중에 확인할 수 있습니다.',
    src: '전자 계약 · PRD §5.2',
  },
  {
    icon: lock,
    title: '되돌릴 수 없는 일은 먼저 확인합니다',
    body: '삭제·취소처럼 되돌릴 수 없는 행동은 무슨 일이 일어나는지 먼저 보여주고 누르게 합니다. 대기 중인 지원이 몇 건 거절되는지까지 말합니다.',
    src: 'ux-philosophy §6 비파괴성',
  },
  {
    icon: clock,
    title: '지원자가 생기면 조건이 잠깁니다',
    body: '지원한 뒤에 예산이나 마감일이 바뀌면 지원자가 다른 조건으로 지원한 셈이 됩니다. 그래서 대기 중인 지원이 있으면 그 둘은 바꿀 수 없습니다.',
    src: 'project-management 규칙 15',
  },
];
