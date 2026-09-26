import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { UserProfile } from '../../types';
import { Modal } from '../ui/Modal';
import {
  AuthLayout, AuthLink, PasswordField,
  authButtonClass, authErrorClass, authInputClass, authLabelClass, authLinkClass,
} from './AuthLayout';

interface LoginPageProps {
  onLogin: (user: UserProfile) => void;
  onGoToRegister: () => void;
}

export function LoginPage({ onLogin, onGoToRegister }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);

  // Guards against a double submit creating two sessions on a slow connection.
  const submitting = useRef(false);
  const recoveryButton = useRef<HTMLButtonElement>(null);

  const closeRecovery = () => {
    setShowRecovery(false);
    recoveryButton.current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const value = identifier.trim();
    const invalid = !value ? 'identifier'
      : value.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 'identifier'
        : !password ? 'password' : '';

    setInvalidField(invalid);
    if (invalid) {
      setError(invalid === 'identifier'
        ? 'Enter your email address or username.'
        : 'Enter your password.');
      event.currentTarget.querySelector<HTMLInputElement>(`[name="${invalid}"]`)?.focus();
      return;
    }

    setError('');
    submitting.current = true;
    setLoading(true);
    try {
      const result = await api.login({ email: value, password });
      onLogin(result.user);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message
        ? err.message
        : 'Unable to sign in. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <header className="mb-7">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">
          Sign in
        </p>
        <h1 id="login-title" className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Continue to your workspace
        </h1>
        <p className="mt-2.5 text-sm leading-6 text-slate-600">
          Use the email address or username issued by your organization.
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="login-title"
        aria-busy={loading}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="login-identifier" className={authLabelClass}>
            Email address or username
          </label>
          <input
            id="login-identifier" name="identifier" type="text"
            autoComplete="username" autoCapitalize="none" spellCheck={false} required
            value={identifier} onChange={(event) => setIdentifier(event.target.value)}
            disabled={loading}
            aria-invalid={invalidField === 'identifier'}
            aria-describedby={invalidField === 'identifier' ? 'login-error' : undefined}
            className={`${authInputClass} ${invalidField === 'identifier' ? 'border-red-400' : ''}`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="login-password" className={authLabelClass}>Password</label>
          <PasswordField
            id="login-password" value={password} onChange={setPassword}
            autoComplete="current-password" disabled={loading}
            invalid={invalidField === 'password'}
            describedBy={invalidField === 'password' ? 'login-error' : undefined}
          />
          <div className="flex justify-end">
            <button
              ref={recoveryButton} type="button"
              onClick={() => setShowRecovery(true)}
              className={authLinkClass}
            >
              Forgot password?
            </button>
          </div>
        </div>

        {error && <p id="login-error" role="alert" className={authErrorClass}>{error}</p>}

        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {loading ? 'Signing in' : 'Sign in'}
        </button>

        <p role="status" className="sr-only">
          {loading ? 'Signing in. Please wait.' : ''}
        </p>
      </form>

      <p className="mt-7 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
        Joining an organization?{' '}
        <AuthLink href="/signup" onNavigate={onGoToRegister}>Create an account</AuthLink>
      </p>

      <Modal
        isOpen={showRecovery}
        onClose={closeRecovery}
        title="Password recovery"
        size="sm"
      >
        <div className="space-y-4 text-sm leading-6 text-slate-600">
          <p>
            Password recovery is handled by your organization administrator.
            Contact them to restore access to your account.
          </p>
          <p className="text-slate-500">No reset request has been sent.</p>
          <button type="button" onClick={closeRecovery} className={authButtonClass}>
            Back to sign in
          </button>
        </div>
      </Modal>
    </AuthLayout>
  );
}
