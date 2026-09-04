import { Link } from 'react-router-dom';
import { Button } from '../../../shared/ui/primitives';
import { PROJECT_ROUTES } from '../project.routes';
import '../home/home.css';
import './info.css';
import { InfoBand } from './InfoBand';

/**
 * 이용 방법 (SCR — 시안 `design/reference-proposal/guide.html` 의 `#how` 절).
 *
 * **준비 중 화면이 아니다.** 이 화면이 하는 일은 이미 정해진 것을 설명하는 것뿐이라
 * 서버도 데이터도 필요 없다. 그래서 블러 뒤에 두지 않고 그냥 연다.
 *
 * 여기 적힌 네 단계와 아래 문답은 전부 **실제 규칙에서 나온 것**이다 — PRD §5.2 흐름,
 * project-management 규칙 15(지원자가 생기면 조건이 잠긴다), 규칙 10(마감은 기본 목록에서
 * 빠진다). 화면이 말하는 것과 코드가 하는 것이 어긋나면 이 문서가 거짓말이 된다.
 */
export function GuidePage() {
  return (
    <>
      <InfoBand current="guide" />

      <div className="if-page">
        <section className="if-sec">
          <h2>이용 방법</h2>
          <p className="if-lede">
            네 단계입니다. 앞 단계를 마쳐야 다음이 열립니다 — 등록해야 지원이 오고, 수락해야
            계약이 열립니다.
          </p>

          <ol className="if-flow">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <article className="card if-step">
                  <span className="if-step__n num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="if-step__who">{step.who}</span>
                </article>
              </li>
            ))}
          </ol>

          <div className="if-cta-row">
            <Link to={PROJECT_ROUTES.register}>
              <Button variant="primary">프로젝트 등록하기</Button>
            </Link>
            <Link to={PROJECT_ROUTES.browse}>
              <Button variant="secondary">프로젝트 찾아보기</Button>
            </Link>
          </div>
        </section>

        <section className="if-sec">
          <h2>자주 묻는 것</h2>
          <div className="if-qa">
            {FAQ.map((qa) => (
              <details key={qa.q}>
                <summary>{qa.q}</summary>
                <p>{qa.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** 번호가 실제 순서다. 단계마다 주체가 바뀌는 것이 이 흐름의 핵심이다 */
const STEPS = [
  {
    title: '프로젝트 등록',
    body: '제목·설명·카테고리를 적고 일정과 예산을 정합니다. 설명을 20자 이상 적으면 AI 단가 분석이 비슷한 프로젝트를 근거로 예산 범위를 알려줍니다.',
    who: '의뢰인',
  },
  {
    title: '지원과 수락',
    body: '경력·제안 금액·예상 기간이 같은 자리에 같은 순서로 표시됩니다. 한 명을 수락하면 나머지 지원은 자동으로 정리되고 지원자에게도 결과가 갑니다.',
    who: '프리랜서 → 의뢰인',
  },
  {
    title: '합의와 계약',
    body: '금액과 일정을 맞춘 뒤 그대로 계약서가 됩니다. 따로 문서를 만들 필요가 없고, 제안·수정·수락 기록이 모두 남습니다.',
    who: '양쪽',
  },
  {
    title: '납품과 정산',
    body: '결제한 금액은 바로 넘어가지 않습니다. 납품을 확인하고 승인한 뒤에 정산됩니다. 완료되면 서로 평가를 남깁니다.',
    who: '양쪽',
  },
];

/**
 * 답은 전부 실제 규칙에서 가져왔다. 마지막 수수료 질문처럼 **아직 정해지지 않은 것은
 * 정해지지 않았다고 적는다** — 그럴듯한 숫자를 넣는 것이 가장 나쁘다.
 */
const FAQ = [
  {
    q: '등록한 프로젝트를 지울 수 있나요?',
    a: '지원자가 없으면 지울 수 있습니다. 대기 중인 지원이 한 건이라도 있으면 지울 수 없습니다 — 지원자 쪽 기록이 함께 사라지기 때문입니다. 그때는 모집을 마감하거나 프로젝트를 취소합니다.',
  },
  {
    q: '예산을 나중에 바꿀 수 있나요?',
    a: '지원자가 생기기 전까지는 바꿀 수 있습니다. 지원이 들어온 뒤에는 예산과 모집 일정이 잠깁니다. 제목·설명·필요 기술은 계속 고칠 수 있습니다.',
  },
  {
    q: '협상하는 사이에 마감일이 지나면요?',
    a: '다시 모집할 수 있습니다. 마감일을 새로 정하면 모집이 열립니다 — 그동안 오간 합의 내용은 그대로 남습니다.',
  },
  {
    q: '마감된 프로젝트는 목록에서 사라지나요?',
    a: '기본 목록에서는 빠집니다. 지원할 수 없는 것이 섞여 있으면 찾는 데 방해가 되기 때문입니다. 필터에서 마감 포함을 고르면 볼 수 있고, 저장해 둔 것은 마감돼도 마이페이지에 남습니다.',
  },
  {
    q: '수수료는 얼마인가요?',
    a: '아직 정해지지 않았습니다. 정해지면 결제 화면에서 수수료와 정산액을 나누어 보여줍니다.',
  },
];
