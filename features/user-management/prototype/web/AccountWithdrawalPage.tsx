import { useEffect, useMemo, useRef, type ChangeEvent, type FormEvent } from "react";
import { AuthFrame, AuthNotice } from "./AuthFrame";

export type AccountWithdrawalPhase =
  | "overview"
  | "reauthentication"
  | "confirmation"
  | "processing"
  | "blocked"
  | "eligibility-unavailable"
  | "reauthentication-required"
  | "rate-limited"
  | "outcome-unknown"
  | "auth-required"
  | "configuration-error"
  | "completed";

export type AccountWithdrawalBlockerCode =
  | "OPEN_PROJECT"
  | "PENDING_APPLICATION"
  | "ACTIVE_NEGOTIATION"
  | "ACTIVE_CONTRACT"
  | "UNSETTLED_PAYMENT"
  | "ACTIVE_DELIVERY";

export type AccountWithdrawalBlocker = {
  code: AccountWithdrawalBlockerCode;
  count: number;
};

export type WithdrawalReauthenticationMethod =
  | { kind: "password" }
  | { kind: "oauth"; provider: "GOOGLE" | "KAKAO" };

export type AccountWithdrawalScreenProps = {
  phase?: AccountWithdrawalPhase;
  reauthenticationMethod?: WithdrawalReauthenticationMethod;
  blockers?: readonly AccountWithdrawalBlocker[];
  passwordValue?: string;
  confirmed?: boolean;
  retryAfterSeconds?: number;
  onBegin?: () => void;
  onPasswordChange?: (value: string) => void;
  onRequestReauthentication?: () => void;
  onConfirmationChange?: (confirmed: boolean) => void;
  onCancel?: () => void;
  onSubmit?: () => void;
  onRetry?: () => void;
};

type BlockerPresentation = { label: string; helper: string; action: string; path: string };

const blockerPresentation: Record<AccountWithdrawalBlockerCode, BlockerPresentation> = {
  OPEN_PROJECT: { label: "진행 중인 프로젝트", helper: "모집 또는 거래 상태를 먼저 정리해 주세요.", action: "내 프로젝트 확인", path: "/projects/mine" },
  PENDING_APPLICATION: { label: "처리 중인 지원", helper: "지원 결과와 연결된 거래를 먼저 확인해 주세요.", action: "내 지원 확인", path: "/applications/mine" },
  ACTIVE_NEGOTIATION: { label: "응답이 필요한 협상", helper: "대기 중인 제안과 응답을 먼저 정리해 주세요.", action: "지원·협상 확인", path: "/applications/mine" },
  ACTIVE_CONTRACT: { label: "진행 중인 계약", helper: "서명 또는 거래 상태를 먼저 확인해 주세요.", action: "계약 확인", path: "/contracts" },
  UNSETTLED_PAYMENT: { label: "정산되지 않은 결제", helper: "결제와 정산 상태를 먼저 확인해 주세요.", action: "결제 확인", path: "/payments" },
  ACTIVE_DELIVERY: { label: "완료되지 않은 납품", helper: "납품 검토 절차를 먼저 마무리해 주세요.", action: "납품 확인", path: "/deliveries" },
};

const defaultBlockers: readonly AccountWithdrawalBlocker[] = [
  { code: "UNSETTLED_PAYMENT", count: 1 },
  { code: "ACTIVE_DELIVERY", count: 1 },
];

const phaseState: Record<AccountWithdrawalPhase, string> = {
  overview: "아직 어떤 계정 정보도 변경되지 않았습니다.",
  reauthentication: "현재 계정의 본인 확인이 필요합니다.",
  confirmation: "본인 확인 완료 · 최종 확인 대기",
  processing: "탈퇴 조건과 계정 상태 확인 중",
  blocked: "진행 중인 항목 때문에 탈퇴가 차단됐습니다.",
  "eligibility-unavailable": "진행 상태를 확인하지 못해 계정을 유지했습니다.",
  "reauthentication-required": "본인 확인이 만료됐습니다.",
  "rate-limited": "본인 확인 재시도 대기 중",
  "outcome-unknown": "기존 요청의 처리 결과 확인 필요",
  "auth-required": "로그인 후 처음부터 다시 진행해야 합니다.",
  "configuration-error": "이 환경에서는 안전한 요청을 시작할 수 없습니다.",
  completed: "PactFive 계정과 모든 로그인 세션 종료 완료",
};

const WITHDRAWAL_STYLES = `
#account-withdrawal-context-title { font-size:clamp(28px,3vw,36px); }
.pf-withdrawal-summary { margin:0 0 20px; padding:20px; border:1px solid var(--pf-border); border-radius:12px; background:var(--pf-subtle); }
.pf-withdrawal-summary--danger { border-color:#fad8cf; background:var(--pf-danger-soft); }
.pf-withdrawal-summary h2 { margin:0; font-size:18px; line-height:28px; }
.pf-withdrawal-summary p { margin:6px 0 0; color:var(--pf-secondary); font-size:14px; line-height:1.6; }
.pf-withdrawal-summary--danger h2,.pf-withdrawal-summary--danger p { color:var(--pf-danger-strong); }
.pf-withdrawal-list { display:grid; gap:10px; margin:16px 0 0; padding:0; list-style:none; }
.pf-withdrawal-list li { position:relative; padding-left:22px; color:var(--pf-secondary); font-size:14px; line-height:1.55; }
.pf-withdrawal-list li::before { position:absolute; top:1px; left:0; color:var(--pf-link); font-weight:800; content:"✓"; }
.pf-withdrawal-summary--danger .pf-withdrawal-list li::before { color:var(--pf-danger); content:"—"; }
.pf-withdrawal-steps { display:grid; gap:0; margin:0 0 24px; padding:0; border-top:1px solid var(--pf-border-subtle); list-style:none; counter-reset:pf-withdrawal-step; }
.pf-withdrawal-steps li { display:grid; grid-template-columns:28px minmax(0,1fr); align-items:start; gap:10px; padding:12px 0; border-bottom:1px solid var(--pf-border-subtle); color:var(--pf-secondary); font-size:14px; counter-increment:pf-withdrawal-step; }
.pf-withdrawal-steps li::before { display:grid; width:24px; height:24px; place-items:center; border-radius:999px; color:#fff; background:var(--pf-inverse); font-size:12px; font-weight:700; content:counter(pf-withdrawal-step); }
.pf-withdrawal-confirm { display:flex; align-items:flex-start; gap:12px; padding:16px; border:1px solid var(--pf-border-interactive); border-radius:8px; background:var(--pf-surface); cursor:pointer; }
.pf-withdrawal-confirm:focus-within { border-color:var(--pf-focus); box-shadow:0 0 0 3px rgba(0,138,141,.28); }
.pf-withdrawal-confirm input { width:20px; height:20px; flex:none; margin:2px 0 0; accent-color:var(--pf-danger); }
.pf-withdrawal-confirm span { color:var(--pf-content); font-size:14px; font-weight:600; line-height:1.55; }
.pf-withdrawal-blockers { display:grid; gap:10px; margin:0 0 20px; padding:0; list-style:none; }
.pf-withdrawal-blocker { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; padding:14px 16px; border:1px solid var(--pf-border); border-radius:8px; background:var(--pf-surface); }
.pf-withdrawal-blocker strong { display:block; font-size:14px; }
.pf-withdrawal-blocker span { display:block; margin-top:2px; color:var(--pf-tertiary); font-size:12px; }
.pf-withdrawal-blocker a { display:inline-flex; min-height:44px; align-items:center; color:var(--pf-link); font-weight:600; }
@media (max-width:767px) { .pf-withdrawal-blocker { grid-template-columns:1fr; } .pf-withdrawal-blocker a { width:max-content; } }
`;

export function AccountWithdrawalScreen({
  phase = "overview",
  reauthenticationMethod = { kind: "password" },
  blockers = defaultBlockers,
  passwordValue = "",
  confirmed = false,
  retryAfterSeconds = 30,
  onBegin,
  onPasswordChange,
  onRequestReauthentication,
  onConfirmationChange,
  onCancel,
  onSubmit,
  onRetry,
}: AccountWithdrawalScreenProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const safeRetryAfter = Math.max(0, Math.floor(retryAfterSeconds));
  const visibleBlockers = useMemo(() => blockers
    .filter((blocker) => blocker.code in blockerPresentation && Number.isFinite(blocker.count) && blocker.count > 0)
    .map((blocker) => ({ ...blocker, count: Math.floor(blocker.count) })), [blockers]);

  useEffect(() => {
    if (phase === "confirmation") cancelRef.current?.focus();
  }, [phase]);

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPasswordChange?.(event.currentTarget.value);
  };
  const handleReauthentication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRequestReauthentication?.();
  };

  const contextRows = [
    { label: "프로필", value: "이름·소개·프로필 이미지 마스킹" },
    { label: "거래 이력", value: "계약·결제·납품·리뷰 등 필요한 기록 보존" },
    { label: "재가입", value: "새 계정으로 시작하며 과거 기록·평점은 연결되지 않음" },
    { label: "현재 상태", value: phaseState[phase] },
  ] as const;

  return (
    <AuthFrame
      idPrefix="account-withdrawal"
      eyebrow="계정 관리 · 되돌릴 수 없는 작업"
      title="회원 탈퇴"
      description="본인 확인을 거쳐 탈퇴를 요청합니다. 마지막 단계 전까지 언제든 중단할 수 있습니다."
      contextKicker="ACCOUNT SAFETY"
      contextTitle="탈퇴 전에 영향을 확인하세요"
      contextDescription="회원 탈퇴는 되돌릴 수 없습니다. 요청이 완료되면 PactFive 계정과 모든 로그인 세션이 종료됩니다."
      contextRows={contextRows}
      contextFootnote="진행 중인 항목이 있거나 상태를 확인하지 못하면 계정은 변경하지 않습니다."
      returnCardTitle="탈퇴 시 처리 범위"
      preservedLabel="실행 전까지 계정 유지됨"
      focusTitleOnMount={phase === "completed"}
    >
      <style>{WITHDRAWAL_STYLES}</style>

      {phase === "overview" && (
        <>
          <AuthNotice>아직 어떤 계정 정보도 변경되지 않았습니다.</AuthNotice>
          <ol className="pf-withdrawal-steps" aria-label="회원 탈퇴 진행 순서">
            <li>탈퇴 후 바뀌는 내용과 보존되는 기록을 확인합니다.</li>
            <li>현재 계정의 본인임을 다시 확인합니다.</li>
            <li>진행 중인 항목을 확인하고 명시적으로 탈퇴를 요청합니다.</li>
          </ol>
          <div className="pf-auth-actions">
            <button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onBegin}>본인 확인하고 계속</button>
            <a className="pf-auth-button pf-auth-button--quiet" href="/settings/account">계정 유지하기</a>
          </div>
        </>
      )}

      {phase === "reauthentication" && reauthenticationMethod.kind === "password" && (
        <>
          <AuthNotice>계정 보호를 위해 탈퇴 전에 본인 확인이 필요합니다. 확인 결과는 5분 동안만 유효합니다.</AuthNotice>
          <form className="pf-auth-form" onSubmit={handleReauthentication} noValidate>
            <div className="pf-auth-field">
              <label className="pf-auth-label" htmlFor="account-withdrawal-password">현재 비밀번호</label>
              <input
                className="pf-auth-input"
                id="account-withdrawal-password"
                type="password"
                autoComplete="current-password"
                value={passwordValue}
                onChange={handlePasswordChange}
                readOnly={!onPasswordChange}
                required
                aria-describedby="account-withdrawal-password-help"
              />
              <p className="pf-auth-help" id="account-withdrawal-password-help">비밀번호는 본인 확인 직후 지우며 화면이나 저장소에 남기지 않습니다.</p>
            </div>
            <button className="pf-auth-button pf-auth-button--primary" type="submit">비밀번호로 본인 확인</button>
            <button className="pf-auth-button pf-auth-button--quiet" type="button" onClick={onCancel}>탈퇴하지 않기</button>
          </form>
        </>
      )}

      {phase === "reauthentication" && reauthenticationMethod.kind === "oauth" && (
        <>
          <AuthNotice>
            연결된 {reauthenticationMethod.provider === "GOOGLE" ? "Google" : "Kakao"} 계정으로 다시 인증해 주세요.
            돌아온 뒤에도 탈퇴는 자동 실행되지 않습니다.
          </AuthNotice>
          <div className="pf-auth-actions">
            <button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onRequestReauthentication}>
              {reauthenticationMethod.provider === "GOOGLE" ? "Google" : "Kakao"}로 본인 확인
            </button>
            <button className="pf-auth-button pf-auth-button--quiet" type="button" onClick={onCancel}>탈퇴하지 않기</button>
          </div>
        </>
      )}

      {phase === "confirmation" && (
        <>
          <section className="pf-withdrawal-summary pf-withdrawal-summary--danger" aria-labelledby="withdrawal-final-heading">
            <h2 id="withdrawal-final-heading">계정 탈퇴 최종 확인</h2>
            <p>이 단계를 실행하면 계정과 모든 로그인 세션이 종료되며 되돌릴 수 없습니다.</p>
            <ul className="pf-withdrawal-list">
              <li>프로필 정보는 마스킹되고 소셜 로그인 연결 해제가 시작됩니다.</li>
              <li>거래·법적 이력은 정책에 따라 보존될 수 있습니다.</li>
              <li>재가입해도 과거 기록과 평점은 새 계정에 연결되지 않습니다.</li>
            </ul>
          </section>
          <label className="pf-withdrawal-confirm" htmlFor="account-withdrawal-confirmation">
            <input
              id="account-withdrawal-confirmation"
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirmationChange?.(event.currentTarget.checked)}
            />
            <span>탈퇴 후 되돌릴 수 없고, 재가입 시 과거 이력이 연결되지 않는다는 내용을 확인했습니다.</span>
          </label>
          <div className="pf-auth-actions pf-auth-flow-after">
            <button ref={cancelRef} className="pf-auth-button pf-auth-button--primary" type="button" onClick={onCancel}>탈퇴 그만두기</button>
            <button className="pf-auth-button pf-auth-button--danger" type="button" disabled={!confirmed} onClick={onSubmit}>회원 탈퇴하기</button>
          </div>
        </>
      )}

      {phase === "processing" && (
        <div aria-busy="true">
          <AuthNotice>탈퇴 조건과 계정 상태를 확인하고 있습니다. 창을 닫지 마세요.</AuthNotice>
          <button className="pf-auth-button pf-auth-button--danger" type="button" disabled>
            <span className="pf-auth-progress" role="status"><span className="pf-auth-spinner" aria-hidden="true" />탈퇴 처리 중…</span>
          </button>
        </div>
      )}

      {phase === "blocked" && (
        <>
          <AuthNotice tone="danger" role="alert" focusKey={phase}>
            진행 중인 항목이 있어 지금은 탈퇴할 수 없습니다. 계정과 로그인 상태는 변경되지 않았습니다.
          </AuthNotice>
          <ul className="pf-withdrawal-blockers" aria-label="먼저 정리할 항목">
            {visibleBlockers.map((blocker) => {
              const presentation = blockerPresentation[blocker.code];
              return (
                <li className="pf-withdrawal-blocker" key={blocker.code}>
                  <div><strong>{presentation.label} {blocker.count}건</strong><span>{presentation.helper}</span></div>
                  <a href={presentation.path}>{presentation.action}</a>
                </li>
              );
            })}
          </ul>
          <a className="pf-auth-button pf-auth-button--secondary" href="/settings/account">계정 설정으로 돌아가기</a>
        </>
      )}

      {phase === "eligibility-unavailable" && (
        <>
          <AuthNotice tone="danger" role="alert" focusKey={phase}>현재 진행 상태를 확인할 수 없어 탈퇴하지 않았습니다. 계정은 변경되지 않았습니다.</AuthNotice>
          <div className="pf-auth-actions"><button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onRetry}>다시 확인</button><button className="pf-auth-button pf-auth-button--quiet" type="button" onClick={onCancel}>탈퇴하지 않기</button></div>
        </>
      )}

      {phase === "reauthentication-required" && (
        <><AuthNotice tone="danger" role="alert" focusKey={phase}>본인 확인이 만료됐거나 확인할 수 없습니다. 다시 본인 확인을 진행해 주세요.</AuthNotice><button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onRetry}>다시 본인 확인</button></>
      )}

      {phase === "rate-limited" && (
        <><AuthNotice tone="danger" role="alert" focusKey={phase}>본인 확인 시도가 잠시 제한됐습니다. {safeRetryAfter}초 후 다시 시도해 주세요.</AuthNotice><div className="pf-auth-actions"><button className="pf-auth-button pf-auth-button--primary" type="button" disabled>{safeRetryAfter}초 후 다시 시도</button><button className="pf-auth-button pf-auth-button--quiet" type="button" onClick={onCancel}>탈퇴하지 않기</button></div></>
      )}

      {phase === "outcome-unknown" && (
        <><AuthNotice tone="danger" role="alert" focusKey={phase}>탈퇴 처리 결과를 확인하지 못했습니다. 새 요청을 만들지 않고 같은 요청으로 결과를 다시 확인합니다.</AuthNotice><button className="pf-auth-button pf-auth-button--primary" type="button" onClick={onRetry}>처리 결과 다시 확인</button></>
      )}

      {phase === "auth-required" && (
        <><AuthNotice tone="danger" role="alert" focusKey={phase}>로그인 상태가 만료됐습니다. 로그인한 뒤 처음부터 다시 진행해 주세요.</AuthNotice><a className="pf-auth-button pf-auth-button--primary" href="/login?returnTo=%2Fsettings%2Faccount%2Fwithdrawal">로그인</a></>
      )}

      {phase === "configuration-error" && (
        <><AuthNotice tone="danger" role="alert" focusKey={phase}>이 환경에서는 안전하게 요청을 보낼 수 없습니다. 공식 서비스 화면에서 다시 시도해 주세요.</AuthNotice><a className="pf-auth-button pf-auth-button--secondary" href="/settings/account">계정 설정으로 돌아가기</a></>
      )}

      {phase === "completed" && (
        <><AuthNotice tone="success">PactFive 계정과 모든 로그인 세션이 종료됐습니다. 외부 로그인 연결 정리는 안전하게 계속 처리됩니다.</AuthNotice><a className="pf-auth-button pf-auth-button--primary" href="/">홈으로 이동</a></>
      )}
    </AuthFrame>
  );
}

export function AccountWithdrawalPage(props: AccountWithdrawalScreenProps) {
  return <AccountWithdrawalScreen {...props} />;
}
