import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { API_BASE, api } from '../api/client';
import type { Student, UserProfile, UserRole } from '../types';
import { ProfileAvatar } from './ui/ProfileAvatar';

export interface ProfilePageProps {
  currentUser: UserProfile;
}

const ROLE_LABELS: Record<UserRole, string> = {
  region_hr_head: 'Region HR Head',
  committee_hr_leader: 'Committee HR Leader',
  committee_head: 'Committee Head',
  committee_hr_member: 'Committee HR Member',
  committee_member: 'Committee Member',
  hr_admin: 'HR Administrator',
  team_lead: 'Team Lead',
  member: 'Member',
};

function recorded(value: string | null | undefined): string {
  return value?.trim() || 'Not provided';
}

function ProfileField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] sm:gap-6">
      <dt className="text-xs font-medium leading-6 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-slate-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

type MemberState =
  | { status: 'loading' }
  | { status: 'ready'; member: Student }
  | { status: 'error'; message: string };

// Keep this targeted read local until the shared client exposes getStudent.
// Never use getStudents or infer a member link from an email address.
function LinkedMemberDetails({ studentId }: { studentId: string }) {
  const [state, setState] = useState<MemberState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    async function loadMember() {
      try {
        const token = api.getToken();
        if (!token) throw new Error('Sign in again to view your linked member record.');
        const response = await fetch(`${API_BASE}/students/${encodeURIComponent(studentId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error('Sign in again to view your linked member record.');
          if (response.status === 403) throw new Error('Your account does not have permission to view this linked member record.');
          if (response.status === 404) throw new Error('Your linked member record could not be found.');
          throw new Error('Linked member details are unavailable. Please try again.');
        }
        const member: Student = await response.json();
        if (!member || member.id !== studentId) {
          throw new Error('The returned member record does not match your account link.');
        }
        if (!controller.signal.aborted) setState({ status: 'ready', member });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ status: 'error', message: error instanceof Error && !(error instanceof TypeError)
            ? error.message : 'Linked member details are unavailable. Please try again.' });
        }
      }
    }

    void loadMember();
    return () => controller.abort();
  }, [studentId, attempt]);

  if (state.status === 'loading') {
    return <p role="status" className="py-6 text-sm text-slate-600">Loading linked member details…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="my-4 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <p role="alert" className="text-sm leading-6 text-rose-800">{state.message}</p>
        <button type="button" onClick={() => { setState({ status: 'loading' }); setAttempt(value => value + 1); }}
          className="mt-3 min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          Retry member details
        </button>
      </div>
    );
  }

  const { member } = state;
  return (
    <dl className="min-w-0 divide-y divide-slate-200">
      <ProfileField label="Member name">{recorded(member.full_name)}</ProfileField>
      <ProfileField label="Arabic member name">
        {member.arabic_name?.trim() ? <span lang="ar" dir="rtl" className="block font-['Cairo']">{member.arabic_name}</span> : 'Not provided'}
      </ProfileField>
      <ProfileField label="Member code">{recorded(member.student_code)}</ProfileField>
      <ProfileField label="Membership status">{recorded(member.status)}</ProfileField>
      <ProfileField label="Member email">{recorded(member.email)}</ProfileField>
      <ProfileField label="Phone">{recorded(member.phone)}</ProfileField>
      <ProfileField label="University">{recorded(member.university)}</ProfileField>
      <ProfileField label="Member role">{recorded(member.role)}</ProfileField>
    </dl>
  );
}

/** Personal, read-only account page. The authenticated shell supplies currentUser. */
export function ProfilePage({ currentUser }: ProfilePageProps) {
  const headingId = useId();
  const accountId = useId();
  const membershipId = useId();
  const profilePanelId = useId();
  const settingsPanelId = useId();
  const settingsHeadingId = useId();
  const [section, setSection] = useState<'profile' | 'settings'>('profile');
  const createdAt = currentUser.created_at ? new Date(currentUser.created_at) : null;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  // Remount on identity/authorization changes so previous member data cannot flash or settle late.
  const memberKey = JSON.stringify([currentUser.id, currentUser.student_id, currentUser.role, currentUser.team_id, currentUser.is_active]);

  return (
    <section aria-labelledby={headingId} className="mx-auto grid w-full min-w-0 max-w-6xl gap-10 py-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] lg:gap-14 lg:py-6">
      <header className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <p className="mb-6 text-xs font-medium tracking-wide text-slate-500">My profile</p>
        <div className="flex items-center gap-5 lg:flex-col lg:items-start lg:gap-6">
          <ProfileAvatar key={currentUser.id} name={currentUser.full_name} size="large" />
          <div className="min-w-0">
            <h1 id={headingId} className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 [overflow-wrap:anywhere] lg:text-3xl">{currentUser.full_name?.trim() || 'My Profile'}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{ROLE_LABELS[currentUser.role]}</p>
            {currentUser.team_name?.trim() ? <p className="text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{currentUser.team_name}</p> : null}
          </div>
        </div>
      </header>

      <div className="min-w-0 space-y-8">
        <nav aria-label="Profile sections" className="flex gap-6 border-b border-slate-200">
          {([{ id: 'profile', label: 'Profile', panel: profilePanelId }, { id: 'settings', label: 'Account settings', panel: settingsPanelId }] as const).map(item => (
            <button key={item.id} type="button" aria-pressed={section === item.id} aria-controls={item.panel}
              onClick={() => setSection(item.id)}
              className={`-mb-px min-h-11 border-b-2 px-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${section === item.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
              {item.label}
            </button>
          ))}
        </nav>
        <div id={profilePanelId} hidden={section !== 'profile'} className="space-y-8">
        <section aria-labelledby={accountId} className="min-w-0">
          <div className="border-b border-slate-200 pb-5">
            <h2 id={accountId} className="text-base font-semibold tracking-tight text-slate-900">Personal details</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Your name, contact details, and committee.</p>
          </div>
          <dl className="min-w-0 divide-y divide-slate-200">
            <ProfileField label="Full name">{recorded(currentUser.full_name)}</ProfileField>
            <ProfileField label="Arabic name">
              {currentUser.arabic_name?.trim() ? <span lang="ar" dir="rtl" className="block w-fit max-w-full font-['Cairo']">{currentUser.arabic_name}</span> : 'Not provided'}
            </ProfileField>
            <ProfileField label="Email address">{recorded(currentUser.email)}</ProfileField>
            <ProfileField label="Committee / team">
              {currentUser.team_name?.trim() || (currentUser.team_id?.trim() ? 'Name unavailable' : 'Not assigned')}
            </ProfileField>
          </dl>
        </section>

        <section aria-labelledby={membershipId} className="min-w-0">
          <div className="border-b border-slate-200 pb-5">
            <h2 id={membershipId} className="text-base font-semibold tracking-tight text-slate-900">Linked member record</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Membership information connected to this account.</p>
          </div>
          {currentUser.student_id?.trim() ? (
            <>
              {currentUser.is_active ? <LinkedMemberDetails key={memberKey} studentId={currentUser.student_id} /> : <p className="mt-4 text-sm text-slate-600">Member details are unavailable while your account is inactive.</p>}
            </>
          ) : (
            <div className="py-5">
              <p className="text-sm font-medium text-slate-800">No member record linked</p>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Ask your administrator to link your membership. Your sign-in account is already available here.</p>
            </div>
          )}
        </section>
        </div>
        <section id={settingsPanelId} hidden={section !== 'settings'} aria-labelledby={settingsHeadingId} className="min-w-0">
          <div className="border-b border-slate-200 pb-5">
            <h2 id={settingsHeadingId} className="text-base font-semibold tracking-tight text-slate-900">Account access</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Managed by your organization. Contact your administrator to update these details.</p>
          </div>
          <dl className="min-w-0 divide-y divide-slate-200">
            <ProfileField label="Account role">{ROLE_LABELS[currentUser.role]}</ProfileField>
            <ProfileField label="Account status">
              <span className={`inline-flex items-center gap-2 text-xs font-medium ${currentUser.is_active ? 'text-teal-800' : 'text-slate-600'}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${currentUser.is_active ? 'bg-teal-600' : 'bg-slate-400'}`} />
                {currentUser.is_active ? 'Active' : 'Inactive'}
              </span>
            </ProfileField>
            <ProfileField label="Account created">
              {validCreatedAt ? <time dateTime={validCreatedAt.toISOString()}>{validCreatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</time> : 'Not provided'}
            </ProfileField>
          </dl>
        </section>
      </div>
    </section>
  );
}
