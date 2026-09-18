import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, Check, Copy, Mail, MessageSquare } from 'lucide-react';
import { api } from '../api/client';
import type { Student, UserProfile, UserRole } from '../types';
import { ProfileAvatar } from './ui/ProfileAvatar';
import { Badge } from './ui/Badge';

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
    <div className="grid min-w-0 gap-1.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)] sm:gap-4">
      <dt className="text-xs font-medium leading-5 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm font-medium leading-5 text-slate-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const norm = status.toUpperCase();
  const variant =
    norm === 'ACTIVE' ? 'success' :
    norm === 'PROBATION' ? 'warning' :
    norm === 'SUSPENDED' || norm === 'REMOVED' ? 'danger' :
    'neutral';
  return <Badge variant={variant} size="sm">{status}</Badge>;
}

type MemberState =
  | { status: 'loading' }
  | { status: 'ready'; member: Student }
  | { status: 'error'; message: string };

function LinkedMemberDetails({ studentId }: { studentId: string }) {
  const [state, setState] = useState<MemberState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    async function loadMember() {
      try {
        const token = api.getToken();
        if (!token) throw new Error('Sign in again to view your linked member record.');
        const member = await api.getStudent(studentId);
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

  const handleCopyCode = (code: string) => {
    if (!code) return;
    try {
      void navigator.clipboard?.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {}
  };

  if (state.status === 'loading') {
    return <p role="status" className="py-6 text-sm text-slate-600">Loading linked member details…</p>;
  }
  if (state.status === 'error') {
    return (
      <div className="my-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
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
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs">
      {/* Collegiate Digital Pass Header Bar */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{recorded(member.full_name)}</p>
          {member.arabic_name?.trim() ? (
            <p lang="ar" dir="rtl" className="mt-0.5 text-sm font-medium text-slate-500 font-['Cairo'] [overflow-wrap:anywhere]">{member.arabic_name}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {member.student_code?.trim() ? (
            <button
              type="button"
              onClick={() => handleCopyCode(member.student_code)}
              title={copiedCode ? 'Copied student code' : 'Copy student code'}
              aria-label={copiedCode ? 'Copied student code' : 'Copy student code'}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/80 bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-200 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <span className="font-mono">{member.student_code}</span>
              {copiedCode ? <Check className="h-3 w-3 text-teal-600" aria-hidden="true" /> : <Copy className="h-3 w-3 text-slate-400" aria-hidden="true" />}
            </button>
          ) : null}
          {member.status?.trim() ? <StatusBadge status={member.status} /> : null}
        </div>
      </div>

      {/* Member Details */}
      <dl className="min-w-0 divide-y divide-slate-100 px-5">
        <ProfileField label="Member email">
          {member.email?.trim() ? (
            <a
              href={`mailto:${member.email.trim()}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
            >
              <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>{member.email.trim()}</span>
            </a>
          ) : 'Not provided'}
        </ProfileField>
        <ProfileField label="Phone">
          {member.phone?.trim() ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>{member.phone.trim()}</span>
              <a
                href={`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
                title="Open WhatsApp chat"
                aria-label="Open WhatsApp chat"
              >
                <MessageSquare className="h-3 w-3 text-teal-600" aria-hidden="true" />
                <span>WhatsApp</span>
              </a>
            </div>
          ) : 'Not provided'}
        </ProfileField>
        <ProfileField label="University">
          {member.university?.trim() ? (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              <span>{member.university.trim()}</span>
            </span>
          ) : 'Not provided'}
        </ProfileField>
        <ProfileField label="Member role">{recorded(member.role)}</ProfileField>
      </dl>
    </div>
  );
}

/** Modern collegiate personal profile & identity pass hub. */
export function ProfilePage({ currentUser }: ProfilePageProps) {
  const headingId = useId();
  const contactId = useId();
  const membershipId = useId();
  const profilePanelId = useId();
  const accountPanelId = useId();
  const accountHeadingId = useId();
  const [section, setSection] = useState<'profile' | 'account'>('profile');
  const createdAt = currentUser.created_at ? new Date(currentUser.created_at) : null;
  const validCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  // Remount on identity/authorization changes so previous member data cannot flash or settle late.
  const memberKey = JSON.stringify([currentUser.id, currentUser.student_id, currentUser.role, currentUser.team_id, currentUser.is_active]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl space-y-6 py-4 sm:py-6">
      {/* Modern Profile Identity Card (no background banner) */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="shrink-0">
              <ProfileAvatar key={currentUser.id} name={currentUser.full_name} size="large" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 id={headingId} className="text-2xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">
                  {currentUser.full_name?.trim() || 'My Profile'}
                </h1>
                {currentUser.arabic_name?.trim() ? (
                  <span lang="ar" dir="rtl" className="font-['Cairo'] text-lg font-semibold text-slate-500 [overflow-wrap:anywhere] sm:text-xl">
                    {currentUser.arabic_name}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                {currentUser.team_name?.trim() ? (
                  <span className="font-medium text-slate-700 [overflow-wrap:anywhere]">{currentUser.team_name}</span>
                ) : null}
                {currentUser.team_name?.trim() && validCreatedAt ? <span aria-hidden="true" className="text-slate-300">·</span> : null}
                {validCreatedAt ? (
                  <span className="text-xs text-slate-400">
                    Member since <time dateTime={validCreatedAt.toISOString()}>{validCreatedAt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</time>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-start">
            <Badge variant="neutral" size="md">{ROLE_LABELS[currentUser.role]}</Badge>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              currentUser.is_active
                ? 'border-teal-200 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-slate-100 text-slate-600'
            }`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${currentUser.is_active ? 'bg-teal-600' : 'bg-slate-400'}`} />
              {currentUser.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </header>

      {/* Modern Segmented Navigation Tabs */}
      <div className="flex">
        <nav aria-label="Profile sections" className="inline-flex rounded-xl border border-slate-200/90 bg-slate-100 p-1">
          {([{ id: 'profile', label: 'Profile', panel: profilePanelId }, { id: 'account', label: 'Account', panel: accountPanelId }] as const).map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={section === item.id}
              aria-controls={item.panel}
              onClick={() => setSection(item.id)}
              className={`min-h-10 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                section === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Profile Content Panels */}
      <div id={profilePanelId} hidden={section !== 'profile'} className="space-y-6">
        {/* Membership Section */}
        <section aria-labelledby={membershipId} className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="border-b border-slate-100 pb-4">
            <h2 id={membershipId} className="text-base font-semibold tracking-tight text-slate-900">Membership</h2>
            <p className="mt-0.5 text-xs text-slate-500">Your organizational student credential and verified standing.</p>
          </div>
          {currentUser.student_id?.trim() ? (
            <>
              {currentUser.is_active ? (
                <LinkedMemberDetails key={memberKey} studentId={currentUser.student_id} />
              ) : (
                <p className="mt-4 text-sm text-slate-600">Member details are unavailable while your account is inactive.</p>
              )}
            </>
          ) : (
            <div className="py-6 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-800">No member record linked</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                Ask your organization administrator or HR team to link your student membership code. Your account access is fully active.
              </p>
            </div>
          )}
        </section>

        {/* Contact & Affiliation Section */}
        <section aria-labelledby={contactId} className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="border-b border-slate-100 pb-4">
            <h2 id={contactId} className="text-base font-semibold tracking-tight text-slate-900">Contact</h2>
            <p className="mt-0.5 text-xs text-slate-500">Your primary communication channels and assigned committee.</p>
          </div>
          <dl className="min-w-0 divide-y divide-slate-100">
            <ProfileField label="Email address">
              {currentUser.email?.trim() ? (
                <a
                  href={`mailto:${currentUser.email.trim()}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span>{currentUser.email.trim()}</span>
                </a>
              ) : 'Not provided'}
            </ProfileField>
            <ProfileField label="Committee / team">
              {currentUser.team_name?.trim() || (currentUser.team_id?.trim() ? 'Name unavailable' : 'Not assigned')}
            </ProfileField>
          </dl>
        </section>
      </div>

      {/* Account Settings Panel */}
      <section id={accountPanelId} hidden={section !== 'account'} aria-labelledby={accountHeadingId} className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div className="border-b border-slate-100 pb-4">
          <h2 id={accountHeadingId} className="text-base font-semibold tracking-tight text-slate-900">Account access</h2>
          <p className="mt-0.5 text-xs text-slate-500">Permissions tier and account lifecycle information managed by your organization.</p>
        </div>
        <dl className="min-w-0 divide-y divide-slate-100">
          <ProfileField label="Account role">{ROLE_LABELS[currentUser.role]}</ProfileField>
          <ProfileField label="Account status">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${currentUser.is_active ? 'text-teal-800' : 'text-slate-600'}`}>
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${currentUser.is_active ? 'bg-teal-600' : 'bg-slate-400'}`} />
              {currentUser.is_active ? 'Active' : 'Inactive'}
            </span>
          </ProfileField>
          <ProfileField label="Account created">
            {validCreatedAt ? (
              <time dateTime={validCreatedAt.toISOString()}>
                {validCreatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </time>
            ) : 'Not provided'}
          </ProfileField>
        </dl>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs leading-relaxed text-slate-600">
            Account role privileges and permissions are centrally governed. To update your role or account profile, contact your committee leader or administrator.
          </p>
        </div>
      </section>
    </div>
  );
}
