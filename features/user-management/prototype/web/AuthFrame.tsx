import { useEffect, useRef, type ReactNode } from "react";

const AUTH_STYLES = `
.pf-auth-page {
  --pf-canvas:#fbfaf7; --pf-surface:#fff; --pf-subtle:#f7f8fa; --pf-muted:#eef1f5;
  --pf-inverse:#0b132b; --pf-inverse-raised:#111b33; --pf-selected:#e7f5f4;
  --pf-content:#0b132b; --pf-secondary:#55627a; --pf-tertiary:#667085; --pf-disabled:#8995a8;
  --pf-link:#006d70; --pf-border:#cbd3df; --pf-border-subtle:#e9edf3; --pf-border-interactive:#7a8498;
  --pf-focus:#008a8d; --pf-action:#006d70; --pf-action-hover:#00585c; --pf-action-pressed:#073f43;
  --pf-danger:#b93824; --pf-danger-strong:#932e20; --pf-danger-soft:#fdeeea;
  --pf-success:#16734d; --pf-success-strong:#115d3e; --pf-success-soft:#eaf7f0;
  --pf-info:#1c5f9c; --pf-info-strong:#164e80; --pf-info-soft:#edf5fc;
  box-sizing:border-box; max-width:1200px; margin:0 auto; padding:64px 32px 80px; color:var(--pf-content);
  font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  line-height:1.5;
}
.pf-auth-page *,.pf-auth-page *::before,.pf-auth-page *::after { box-sizing:border-box; }
.pf-auth-skip { position:fixed; z-index:100; top:12px; left:12px; padding:10px 14px; border-radius:8px;
  color:#fff; background:var(--pf-inverse); transform:translateY(-180%); transition:transform 160ms cubic-bezier(.2,0,0,1); }
.pf-auth-skip:focus { transform:translateY(0); }
.pf-auth-layout { display:grid; grid-template-columns:minmax(0,.88fr) minmax(420px,1fr); overflow:hidden;
  border:1px solid var(--pf-border); border-radius:16px; background:var(--pf-surface); }
.pf-auth-context { display:flex; min-height:650px; flex-direction:column; justify-content:space-between; gap:40px;
  padding:48px; color:#fff; background:var(--pf-inverse); }
.pf-auth-kicker,.pf-auth-eyebrow { margin:0 0 12px; font-size:12px; font-weight:700; letter-spacing:.2px; }
.pf-auth-kicker { color:#8fd3d1; }
.pf-auth-context h2 { max-width:14em; margin:0; font-size:clamp(28px,3.3vw,40px); line-height:1.2; letter-spacing:-.6px; word-break:keep-all; }
.pf-auth-context-copy { max-width:34em; margin:18px 0 0; color:#d5dce7; font-size:16px; line-height:1.65; }
.pf-auth-return-card { border:1px solid #394760; border-radius:12px; background:var(--pf-inverse-raised); }
.pf-auth-return-head { padding:18px 20px; border-bottom:1px solid #394760; }
.pf-auth-return-head p { margin:0; font-size:16px; font-weight:700; }
.pf-auth-preserved { display:block; margin-top:4px; color:#a7dfc5; font-size:12px; font-weight:600; }
.pf-auth-return-list { display:grid; gap:16px; margin:0; padding:20px; }
.pf-auth-return-row { display:grid; grid-template-columns:104px minmax(0,1fr); gap:12px; }
.pf-auth-return-row dt { color:#b7c0cf; font-size:13px; }
.pf-auth-return-row dd { min-width:0; margin:0; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
.pf-auth-return-path { display:block; margin-top:4px; color:#b7c0cf; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:12px; font-weight:400; }
.pf-auth-context-note { margin:16px 2px 0; color:#b7c0cf; font-size:13px; line-height:1.6; }
.pf-auth-panel { display:flex; min-width:0; align-items:center; padding:48px clamp(32px,5vw,64px); }
.pf-auth-content { width:100%; max-width:440px; margin:0 auto; }
.pf-auth-eyebrow { color:var(--pf-link); }
.pf-auth-title { margin:0; font-size:clamp(32px,4vw,40px); line-height:1.2; letter-spacing:-.6px; }
.pf-auth-description { margin:12px 0 28px; color:var(--pf-secondary); font-size:15px; line-height:1.65; }
.pf-auth-notice { margin:0 0 20px; padding:12px 14px; border:1px solid transparent; border-radius:8px; font-size:14px; line-height:1.55; }
.pf-auth-notice--info { border-color:#b9d9f3; color:var(--pf-info-strong); background:var(--pf-info-soft); }
.pf-auth-notice--danger { border-color:#fad8cf; color:var(--pf-danger-strong); background:var(--pf-danger-soft); }
.pf-auth-notice--success { border-color:#a7dfc5; color:var(--pf-success-strong); background:var(--pf-success-soft); }
.pf-auth-error-summary { margin:0 0 20px; padding:14px 16px; border-left:3px solid var(--pf-danger);
  color:var(--pf-danger-strong); background:var(--pf-danger-soft); font-size:14px; }
.pf-auth-error-summary strong { display:block; margin-bottom:2px; }
.pf-auth-error-summary ul { margin:8px 0 0; padding-left:20px; }
.pf-auth-form { display:grid; gap:24px; }
.pf-auth-field { display:grid; gap:8px; min-width:0; }
.pf-auth-label,.pf-auth-field > legend { color:var(--pf-content); font-size:14px; font-weight:600; }
.pf-auth-help { margin:0; color:var(--pf-tertiary); font-size:14px; line-height:1.5; }
.pf-auth-field-error { margin:0; color:var(--pf-danger); font-size:13px; font-weight:600; }
.pf-auth-input-wrap { position:relative; }
.pf-auth-input { width:100%; min-height:48px; padding:11px 16px; border:1px solid var(--pf-border-interactive);
  border-radius:8px; color:var(--pf-content); background:var(--pf-surface); font:inherit; font-size:16px; line-height:24px;
  transition:border-color 100ms cubic-bezier(.2,0,0,1),box-shadow 100ms cubic-bezier(.2,0,0,1); }
.pf-auth-input::placeholder { color:var(--pf-tertiary); opacity:1; }
.pf-auth-input:hover:not(:disabled) { border-color:var(--pf-secondary); }
.pf-auth-input:focus { border-color:var(--pf-focus); outline:0; box-shadow:0 0 0 3px rgba(0,138,141,.28); }
.pf-auth-input[aria-invalid="true"] { border-color:var(--pf-danger); }
.pf-auth-input:disabled { color:var(--pf-disabled); background:var(--pf-muted); cursor:not-allowed; }
.pf-auth-password-input { padding-right:106px; }
.pf-auth-password-toggle { position:absolute; top:2px; right:2px; min-width:92px; min-height:44px; padding:0 10px;
  border:0; border-radius:6px; color:var(--pf-link); background:transparent; font:inherit; font-size:13px; font-weight:600; cursor:pointer; }
.pf-auth-password-toggle:hover:not(:disabled) { background:var(--pf-selected); }
.pf-auth-role { margin:0; padding:0; border:0; }
.pf-auth-role-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px; }
.pf-auth-role-card { display:grid; min-height:112px; align-content:start; gap:8px; padding:16px; border:1px solid var(--pf-border-interactive);
  border-radius:12px; background:var(--pf-surface); cursor:pointer; transition:border-color 100ms cubic-bezier(.2,0,0,1),background 100ms cubic-bezier(.2,0,0,1); }
.pf-auth-role-card:hover,.pf-auth-role-card:focus-within { border-color:var(--pf-focus); }
.pf-auth-role-card:has(input:checked) { border-color:var(--pf-action); background:var(--pf-selected); }
.pf-auth-role-main { display:flex; align-items:center; gap:8px; font-weight:700; }
.pf-auth-role-main input { accent-color:var(--pf-action); }
.pf-auth-role-card small { color:var(--pf-secondary); font-size:13px; line-height:1.5; }
.pf-auth-oauth,.pf-auth-actions { display:grid; gap:8px; }
.pf-auth-divider { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px; color:var(--pf-tertiary); font-size:12px; }
.pf-auth-divider::before,.pf-auth-divider::after { height:1px; background:var(--pf-border-subtle); content:""; }
.pf-auth-button { display:inline-flex; width:100%; min-height:44px; align-items:center; justify-content:center; gap:8px; padding:0 16px;
  border:1px solid transparent; border-radius:8px; font:inherit; font-size:16px; font-weight:600; text-decoration:none; cursor:pointer;
  transition:background 100ms cubic-bezier(.2,0,0,1),border-color 100ms cubic-bezier(.2,0,0,1),transform 100ms cubic-bezier(.2,0,0,1); }
.pf-auth-button--primary { color:#fff; background:var(--pf-action); }
.pf-auth-button--primary:hover:not(:disabled) { background:var(--pf-action-hover); }
.pf-auth-button--primary:active:not(:disabled) { background:var(--pf-action-pressed); transform:translateY(1px); }
.pf-auth-button--secondary { border-color:var(--pf-action); color:var(--pf-link); background:var(--pf-surface); }
.pf-auth-button--secondary:hover:not(:disabled) { background:var(--pf-selected); }
.pf-auth-button--quiet { color:var(--pf-secondary); background:transparent; }
.pf-auth-button--quiet:hover:not(:disabled) { background:var(--pf-subtle); }
.pf-auth-button--danger { color:#fff; background:var(--pf-danger); }
.pf-auth-button--danger:hover:not(:disabled) { background:var(--pf-danger-strong); }
.pf-auth-button--danger:active:not(:disabled) { background:var(--pf-danger-strong); transform:translateY(1px); }
.pf-auth-button:disabled { border-color:transparent; color:var(--pf-disabled); background:var(--pf-muted); cursor:not-allowed; }
.pf-auth-prompt { margin:24px 0 0; padding-top:20px; border-top:1px solid var(--pf-border-subtle); color:var(--pf-secondary); text-align:center; font-size:14px; }
.pf-auth-link { color:var(--pf-link); font-weight:600; }
.pf-auth-flow-before { margin-bottom:20px; }
.pf-auth-flow-after { margin-top:24px; }
.pf-auth-notice-after { margin-top:20px; }
.pf-auth-support-copy { margin-top:10px; }
.pf-auth-divider--spaced { margin:24px 0; }
.pf-auth-progress { display:inline-flex; align-items:center; gap:8px; }
.pf-auth-spinner { width:18px; height:18px; flex:none; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; animation:pf-auth-spin 720ms linear infinite; }
@keyframes pf-auth-spin { to { transform:rotate(360deg); } }
.pf-auth-page :focus-visible { outline:2px solid var(--pf-focus); outline-offset:3px; box-shadow:0 0 0 3px rgba(0,138,141,.28); }
@media (max-width:1023px) { .pf-auth-page { padding-right:24px; padding-left:24px; } }
@media (max-width:840px) {
  .pf-auth-page { max-width:680px; padding-top:40px; padding-bottom:64px; }
  .pf-auth-layout { grid-template-columns:1fr; }
  .pf-auth-context { min-height:auto; padding:36px; }
  .pf-auth-return-card { margin-top:32px; }
  .pf-auth-panel { padding:44px 36px 48px; }
}
@media (max-width:767px) {
  .pf-auth-page { padding:24px 16px 48px; }
  .pf-auth-context,.pf-auth-panel { padding:28px 20px; }
  .pf-auth-return-row { grid-template-columns:1fr; gap:2px; }
}
@media (max-width:560px) { .pf-auth-role-grid { grid-template-columns:1fr; } }
@media (prefers-reduced-motion:reduce) {
  .pf-auth-page *,.pf-auth-page *::before,.pf-auth-page *::after { transition-duration:0ms !important; animation-duration:0ms !important; animation-iteration-count:1 !important; }
}
`;

type AuthFrameProps = {
  idPrefix: string;
  eyebrow: string;
  title: string;
  description: string;
  contextKicker?: string;
  contextTitle: string;
  contextDescription: string;
  contextState?: string;
  contextRows?: readonly { label: string; value: ReactNode }[];
  contextFootnote?: ReactNode;
  returnTo?: string;
  returnLabel?: string;
  returnCardTitle?: string;
  preservedLabel?: string;
  focusTitleOnMount?: boolean;
  children: ReactNode;
};

export function getReturnLabel(path: string): string {
  if (path === "/") return "홈";
  if (path === "/projects/new") return "프로젝트 등록";
  if (path === "/bookmarks") return "관심 프로젝트";
  if (path === "/profile") return "프로필";
  if (path.startsWith("/projects/")) return "프로젝트 상세";
  if (path === "/projects") return "프로젝트 목록";
  return "이전 작업";
}

export function AuthFrame({
  idPrefix,
  eyebrow,
  title,
  description,
  contextKicker = "CONTEXT RECOVERY",
  contextTitle,
  contextDescription,
  contextState,
  contextRows,
  contextFootnote = "외부 주소는 복귀 경로로 사용하지 않습니다.",
  returnTo,
  returnLabel = returnTo ? getReturnLabel(returnTo) : "가입할 때 저장한 안전한 내부 경로",
  returnCardTitle = "인증 후 계속할 작업",
  preservedLabel = "작성 내용 보존됨",
  focusTitleOnMount = false,
  children,
}: AuthFrameProps) {
  const titleId = `${idPrefix}-title`;
  const contextTitleId = `${idPrefix}-context-title`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusTitleOnMount) titleRef.current?.focus();
  }, [focusTitleOnMount]);
  return (
    <section className="pf-auth-page" aria-labelledby={titleId}>
      <style>{AUTH_STYLES}</style>
      <a className="pf-auth-skip" href={`#${titleId}`}>{title} 영역으로 건너뛰기</a>
      <div className="pf-auth-layout">
        <aside className="pf-auth-context" aria-labelledby={contextTitleId}>
          <div>
            <p className="pf-auth-kicker">{contextKicker}</p>
            <h2 id={contextTitleId}>{contextTitle}</h2>
            <p className="pf-auth-context-copy">{contextDescription}</p>
          </div>
          <div>
            <section className="pf-auth-return-card" aria-label={returnCardTitle}>
              <div className="pf-auth-return-head">
                <p>{returnCardTitle}</p>
                <span className="pf-auth-preserved">✓ {preservedLabel}</span>
              </div>
              <dl className="pf-auth-return-list">
                {contextRows ? contextRows.map((row) => (
                  <div className="pf-auth-return-row" key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                )) : (
                  <>
                    <div className="pf-auth-return-row"><dt>돌아갈 위치</dt><dd>{returnLabel}</dd></div>
                    {returnTo && (
                      <div className="pf-auth-return-row">
                        <dt>이동 경로</dt>
                        <dd>안전하게 확인된 내부 경로<code className="pf-auth-return-path">{returnTo}</code></dd>
                      </div>
                    )}
                    {contextState && <div className="pf-auth-return-row"><dt>현재 상태</dt><dd>{contextState}</dd></div>}
                  </>
                )}
              </dl>
            </section>
            <p className="pf-auth-context-note">{contextFootnote}</p>
          </div>
        </aside>
        <div className="pf-auth-panel">
          <div className="pf-auth-content">
            <p className="pf-auth-eyebrow">{eyebrow}</p>
            <h1 className="pf-auth-title" id={titleId} ref={titleRef} tabIndex={-1}>{title}</h1>
            <p className="pf-auth-description">{description}</p>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AuthNotice({ children, tone = "info", role = "status", focusKey }: {
  children: ReactNode;
  tone?: "info" | "danger" | "success";
  role?: "status" | "alert";
  focusKey?: string | number;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusKey !== undefined) noticeRef.current?.focus();
  }, [focusKey]);
  return (
    <div
      className={`pf-auth-notice pf-auth-notice--${tone}`}
      ref={noticeRef}
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      tabIndex={focusKey === undefined ? undefined : -1}
    >
      {children}
    </div>
  );
}
