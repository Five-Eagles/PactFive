import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Field, Notice, SkeletonStack } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { profileApi, type Profile } from './api/profile';
import { useAuth } from './useAuth';

const CATEGORIES = [['WEB_DEVELOPMENT','웹 개발'],['MOBILE_APP','모바일 앱'],['DESIGN','디자인'],['DATA_AI','데이터·AI'],['PLANNING','기획'],['MARKETING','마케팅']] as const;

export function ProfilePage() {
  const { state } = useAuth();
  const navigate = useNavigate(); const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile>({ name: '', profileImageUrl: null, bio: null });
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  useEffect(() => { void profileApi.get().then(({ profile: value }) => setProfile(value)).catch((error) => setNotice({ tone: 'danger', text: error instanceof ApiError ? error.message : '프로필을 불러오지 못했습니다.' })).finally(() => setLoading(false)); }, []);
  if (state.status !== 'authenticated') return <PageBody><Notice tone="warning">로그인 후 프로필을 작성할 수 있습니다.</Notice></PageBody>;
  const isClient = state.session.user.role === 'CLIENT'; const update = (patch: Partial<Profile>) => setProfile((current) => ({ ...current, ...patch }));
  async function save(event: React.FormEvent) { event.preventDefault(); setBusy(true); setNotice(null); try { const result = await profileApi.save(profile); setProfile(result.profile); const returnTo = searchParams.get('returnTo'); if (returnTo?.startsWith('/')) { navigate(returnTo, { replace: true }); return; } setNotice({ tone: 'info', text: '프로필을 저장했습니다.' }); } catch (error) { setNotice({ tone: 'danger', text: error instanceof ApiError ? error.message : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }); } finally { setBusy(false); } }
  return <PageBody narrow><header style={{ marginBottom: 28 }}><p className="caption">내 정보 · {isClient ? '의뢰인' : '프리랜서'}</p><h1 className="h3" style={{ marginBottom: 8 }}>프로필 작성</h1><p className="helper">프로젝트와 지원서에서 상대방에게 보여질 정보를 관리합니다.</p></header>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}{loading ? <SkeletonStack shape="field" lines={4} label="프로필을 불러오는 중입니다" /> : <form onSubmit={save}>
      <section className="card" style={{ marginBottom: 20 }}><h2 className="h4" style={{ marginTop: 0 }}>기본 정보</h2>
        <Field id="profile-name" label="이름" required helperText="프로젝트 카드와 지원서에 표시됩니다."><input className="field" id="profile-name" value={profile.name} onChange={(e) => update({ name: e.target.value })} required maxLength={50} /></Field>
        <Field id="profile-bio" label="한 줄 소개" helperText="나를 설명하는 짧은 문장을 입력해 주세요."><textarea className="field" id="profile-bio" value={profile.bio ?? ''} onChange={(e) => update({ bio: e.target.value })} maxLength={500} /></Field>
      </section>
      <section className="card" style={{ marginBottom: 24 }}><h2 className="h4" style={{ marginTop: 0 }}>{isClient ? '의뢰인 정보' : '프리랜서 정보'}</h2>
        {isClient ? <><Field id="profile-company" label="회사명" required><input className="field" id="profile-company" value={profile.companyName ?? ''} onChange={(e) => update({ companyName: e.target.value })} required maxLength={100} /></Field><Field id="profile-website" label="웹사이트" helperText="선택 입력"><input className="field" id="profile-website" type="url" value={profile.websiteUrl ?? ''} onChange={(e) => update({ websiteUrl: e.target.value })} placeholder="https://" /></Field></> : <><Field id="profile-category" label="주요 활동 분야" required><select className="field" id="profile-category" value={profile.primaryCategory ?? ''} onChange={(e) => update({ primaryCategory: e.target.value })} required><option value="">분야를 선택해 주세요</option>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field id="profile-career" label="경력 연수" required><input className="field" id="profile-career" type="number" min={0} max={32767} value={profile.careerYears ?? 0} onChange={(e) => update({ careerYears: Number(e.target.value) })} required /></Field><Field id="profile-skills" label="기술" required helperText="기술 ID를 쉼표로 구분해 입력해 주세요."><input className="field" id="profile-skills" value={(profile.skills ?? []).join(', ')} onChange={(e) => update({ skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} required /></Field><Field id="profile-portfolio" label="포트폴리오 URL" helperText="선택 입력"><input className="field" id="profile-portfolio" type="url" value={profile.portfolioUrl ?? ''} onChange={(e) => update({ portfolioUrl: e.target.value })} placeholder="https://" /></Field></>}
      </section><div className="btn-row"><Button type="submit" variant="primary" loading={busy}>{busy ? '저장 중…' : '프로필 저장'}</Button></div>
    </form>}</PageBody>;
}
