import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { UserProfile, TeamItem } from '../../types';
import {
  AuthLayout, AuthLink, PasswordField,
  authButtonClass, authErrorClass, authInputClass, authLabelClass, authLinkClass,
} from './AuthLayout';

interface RegisterPageProps {
  onRegister: (user: UserProfile) => void;
  onGoToLogin: () => void;
}

export function RegisterPage({ onRegister, onGoToLogin }: RegisterPageProps) {
  const [name, setName] = useState('');
  const [arabicName, setArabicName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState(false);
  const [teamsAttempt, setTeamsAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');

  // Guards against a double submit creating two accounts.
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadTeams() {
      setTeamsLoading(true);
      setTeamsError(false);
      try {
        const result = await api.getTeams();
        if (active) setTeams(result);
      } catch {
        if (active) setTeamsError(true);
      } finally {
        if (active) setTeamsLoading(false);
      }
    }
    void loadTeams();
    return () => { active = false; };
  }, [teamsAttempt]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const invalid = !name.trim() ? 'full_name'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'email'
        : password.length < 8 ? 'password' : '';

    setInvalidField(invalid);
    if (invalid) {
      setError(invalid === 'full_name' ? 'Enter your full name.'
        : invalid === 'email' ? 'Enter a valid email address.'
          : 'Your password must be at least 8 characters.');
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${invalid}"]`)?.focus();
      return;
    }

    setError('');
    submitting.current = true;
    setLoading(true);
    try {
      const result = await api.register({
        email: email.trim(),
        password,
        full_name: name.trim(),
        arabic_name: arabicName.trim() || undefined,
        role: 'member',
        team_id: teamId || undefined,
      });
      onRegister(result.user);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to create your account. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <header className="mb-7">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
          Create an account
        </p>
        <h1 id="register-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Join your organization
        </h1>
        <p className="mt-2.5 text-sm leading-6 text-slate-600">
          New accounts start with member access. An administrator grants any
          additional permissions.
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="register-title"
        aria-busy={loading}
        className="space-y-5"
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <label htmlFor="register-name" className={authLabelClass}>Full name</label>
            <input
              id="register-name" name="full_name" type="text"
              autoComplete="name" required
              value={name} onChange={(event) => setName(event.target.value)} disabled={loading}
              aria-invalid={invalidField === 'full_name'}
              aria-describedby={invalidField === 'full_name' ? 'register-error' : undefined}
              className={`${authInputClass} ${invalidField === 'full_name' ? 'border-red-400' : ''}`}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="register-arabic-name" className={authLabelClass}>
              <span lang="ar" dir="rtl" className="font-arabic">الاسم بالعربية</span>
              <span className="ml-1.5 font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="register-arabic-name" name="arabic_name" type="text"
              lang="ar" dir="rtl" autoComplete="off"
              value={arabicName} onChange={(event) => setArabicName(event.target.value)}
              disabled={loading} className={`${authInputClass} font-arabic`}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="register-email" className={authLabelClass}>Email address</label>
          <input
            id="register-email" name="email" type="email"
            autoComplete="email" autoCapitalize="none" spellCheck={false} required
            value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading}
            aria-invalid={invalidField === 'email'}
            aria-describedby={invalidField === 'email' ? 'register-error' : undefined}
            className={`${authInputClass} ${invalidField === 'email' ? 'border-red-400' : ''}`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="register-password" className={authLabelClass}>Password</label>
          <PasswordField
            id="register-password" value={password} onChange={setPassword}
            autoComplete="new-password" minLength={8} disabled={loading}
            invalid={invalidField === 'password'}
            describedBy={`password-help${invalidField === 'password' ? ' register-error' : ''}`}
          />
          <p id="password-help" className="text-xs leading-5 text-slate-600">
            Use at least 8 characters. Spaces count as characters.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="register-team" className={authLabelClass}>
            Committee
            <span className="ml-1.5 font-normal text-slate-500">(optional)</span>
          </label>
          <select
            id="register-team" name="team_id" value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            disabled={loading || teamsLoading || teamsError || teams.length === 0}
            aria-describedby="team-help"
            className={authInputClass}
          >
            <option value="">No committee selected</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name} ({team.code})</option>
            ))}
          </select>

          <p id="team-help" role="status" className="text-xs leading-5 text-slate-600">
            {teamsLoading ? 'Loading committees'
              : teamsError ? 'Committees could not be loaded. You can continue without one.'
                : teams.length === 0 ? 'No committees are available. You can continue without one.'
                  : 'Choose your committee, or leave this blank.'}
          </p>

          {teamsError && (
            <div role="alert" className={authErrorClass}>
              <p>The committee list is unavailable.</p>
              <button
                type="button" onClick={() => setTeamsAttempt((n) => n + 1)}
                disabled={loading} className={`mt-1 min-h-11 text-sm disabled:opacity-60 ${authLinkClass}`}
              >
                Retry loading committees
              </button>
            </div>
          )}
        </div>

        {error && <p id="register-error" role="alert" className={authErrorClass}>{error}</p>}

        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {loading ? 'Creating account' : 'Create account'}
        </button>

        <p role="status" className="sr-only">
          {loading ? 'Creating your account. Please wait.' : ''}
        </p>
      </form>

      <p className="mt-7 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
        Already have an account?{' '}
        <AuthLink href="/login" onNavigate={onGoToLogin}>Sign in</AuthLink>
      </p>
    </AuthLayout>
  );
}
