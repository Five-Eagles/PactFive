import { Link } from 'react-router-dom';
import { PROJECT_ROUTES } from '../project.routes';
import '../home/home.css';
import './info.css';
import { INFO_ROUTES } from './info.paths';

/**
 * 약관 · 개인정보처리방침 · 고객센터.
 *
 * 시안에 없는 세 화면이다. 대표 페이지 푸터가 가리키던 자리라 만들어 둔다.
 *
 * **여기서 법률 문구나 연락처를 지어내지 않는다.** 그럴듯한 약관 조문이나 없는 전화번호를
 * 채워 넣으면 읽는 사람이 그것을 진짜로 여긴다. 대신 **무엇이 들어갈 자리인지**를 적고,
 * 아직 확정 전이라는 것을 화면이 직접 말한다.
 *
 * 목차만 있는 것이 빈 페이지보다 낫다. 무엇을 정해야 하는지가 드러나기 때문이다.
 */
export type PolicyKey = 'terms' | 'privacy' | 'support';

export function PolicyPage({ policy }: { policy: PolicyKey }) {
  const doc = POLICIES[policy];

  return (
    <>
      <section className="if-band">
        <div className="if-band__in">
          <h1>{doc.title}</h1>
          <p>{doc.lede}</p>
        </div>
      </section>

      <div className="if-page">
        <div className="if-sec if-doc">
          <div className="if-draft" role="note">
            <span aria-hidden="true">🛈</span>
            <span>
              <b>아직 확정되지 않은 문서입니다.</b>
              {doc.draftNote}
            </span>
          </div>

          {doc.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {s.items && (
                <ul>
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <div className="if-cta-row">
            <Link to={INFO_ROUTES.guide}>이용 방법</Link>
            <Link to={INFO_ROUTES.safety}>안전한 거래</Link>
            <Link to={PROJECT_ROUTES.browse}>프로젝트 찾기</Link>
          </div>
        </div>
      </div>
    </>
  );
}

type PolicyDoc = {
  title: string;
  lede: string;
  draftNote: string;
  sections: { heading: string; body: string[]; items?: string[] }[];
};

const POLICIES: Record<PolicyKey, PolicyDoc> = {
  terms: {
    title: '이용약관',
    lede: '서비스를 쓰실 때 서로가 지킬 것을 정한 문서입니다.',
    draftNote:
      ' 아래는 어떤 항목을 담을지 정리한 목차입니다. 실제 조문은 법률 검토를 거친 뒤 이 자리에 올립니다.',
    sections: [
      {
        heading: '담을 항목',
        body: [
          '프리랜서 중개 서비스라 돈과 약속이 오갑니다. 문제가 생겼을 때 누구의 책임인지가 미리 적혀 있어야 합니다.',
        ],
        items: [
          '서비스가 무엇을 하고 무엇을 하지 않는지 — 저희는 중개를 하고, 일 자체는 양쪽이 계약합니다',
          '계정을 만들고 지우는 방법, 계정이 정지되는 경우',
          '결제와 정산 — 언제 돈이 오가고, 수수료가 얼마인지',
          '분쟁이 생겼을 때의 처리 절차',
          '금지하는 행위와 그때 저희가 할 수 있는 조치',
          '약관을 바꿀 때 언제 어떻게 알려드리는지',
        ],
      },
      {
        heading: '지금 정해진 것',
        body: [
          '결제한 금액은 납품을 승인하기 전까지 보관됩니다. 어느 쪽도 임의로 가져갈 수 없습니다.',
          '합의한 금액과 일정이 그대로 계약 내용이 됩니다. 제안·수정·수락 기록이 남습니다.',
          '수수료는 아직 정해지지 않았습니다. 정해지면 결제 화면에서 수수료와 정산액을 나누어 보여드립니다.',
        ],
      },
    ],
  },

  privacy: {
    title: '개인정보처리방침',
    lede: '어떤 정보를 받고, 어디에 쓰고, 언제 지우는지 적은 문서입니다.',
    draftNote:
      ' 아래는 지금 서비스가 실제로 다루는 정보를 정리한 것입니다. 법정 고지 문구는 검토를 거친 뒤 채웁니다.',
    sections: [
      {
        heading: '지금 받는 정보',
        body: ['서비스를 쓰는 데 필요한 것만 받습니다. 아래가 전부입니다.'],
        items: [
          '가입할 때 — 이메일, 비밀번호, 이름, 역할(의뢰인 또는 프리랜서)',
          '프리랜서 프로필 — 소개, 주요 분야, 경력, 시간당 단가, 기술',
          '프로젝트를 등록하면 — 제목, 설명, 카테고리, 예산, 일정, 필요 기술',
          '계약과 결제 — 합의 금액, 일정, 결제·정산 기록',
        ],
      },
      {
        heading: '어디에 쓰는지',
        body: [
          '받은 정보는 서비스를 굴리는 데만 씁니다 — 프로젝트를 보여주고, 지원을 잇고, 계약과 정산을 처리합니다.',
          '광고에 쓰거나 다른 회사에 넘기지 않습니다.',
        ],
      },
      {
        heading: '아직 정해야 하는 것',
        body: ['다음 세 가지는 법률 검토가 필요해 아직 비어 있습니다.'],
        items: [
          '보관 기간 — 계정을 지운 뒤 기록을 얼마나 남길지 (거래 기록은 법으로 정해진 기간이 있습니다)',
          '위탁 업체 — 결제 대행처럼 정보를 함께 다루는 곳의 목록',
          '문의 창구 — 정보를 보거나 지워달라고 하실 때 연락하는 곳',
        ],
      },
    ],
  },

  support: {
    title: '고객센터',
    lede: '막히는 일이 있을 때 찾는 곳입니다.',
    draftNote:
      ' 문의 창구는 아직 열리지 않았습니다. 없는 번호나 주소를 적는 대신, 지금 도움이 될 만한 곳을 안내합니다.',
    sections: [
      {
        heading: '먼저 확인해 보실 것',
        body: [
          '자주 나오는 질문은 이용 방법 화면 아래에 모아 두었습니다 — 프로젝트를 지우는 조건, 예산이 잠기는 시점, 마감된 프로젝트를 찾는 법 같은 것들입니다.',
          '거래가 어떻게 보호되는지는 안전한 거래 화면에 정리돼 있습니다.',
        ],
      },
      {
        heading: '준비 중인 창구',
        body: ['아래 셋을 준비하고 있습니다. 열리는 대로 이 화면에 올립니다.'],
        items: [
          '문의 접수 — 화면에서 바로 남기고 답변을 받는 자리',
          '분쟁 조정 — 납품이나 정산에서 다툼이 생겼을 때의 절차',
          '신고 — 약관을 어긴 활동을 알리는 자리',
        ],
      },
    ],
  },
};
