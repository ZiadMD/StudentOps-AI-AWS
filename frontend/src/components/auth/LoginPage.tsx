import { useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import type { UserProfile } from '../../types';
import { Modal } from '../ui/Modal';
import { AuthLayout, AuthLink, PasswordField, authButtonClass, authErrorClass, authInputClass, authLinkClass } from './AuthLayout';

interface LoginPageProps {
  onLogin: (user: UserProfile) => void;
  onGoToRegister: () => void;
}

export function LoginPage({ onLogin, onGoToRegister }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const submitting = useRef(false);
  const recoveryButton = useRef<HTMLButtonElement>(null);

  const closeRecovery = () => {
    setShowForgotModal(false);
    recoveryButton.current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const invalid = !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? 'email' : !password ? 'password' : '';
    setInvalidField(invalid);
    if (invalid) {
      setError(invalid === 'email' ? 'Enter a valid email address.' : 'Enter your password.');
      form.querySelector<HTMLInputElement>(`[name="${invalid}"]`)?.focus();
      return;
    }
    setError('');
    submitting.current = true;
    setLoading(true);
    try {
      const result = await api.login({ email: email.trim(), password });
      onLogin(result.user);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <header className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">Welcome back</p>
        <h1 id="login-title" className="text-3xl font-semibold tracking-tight text-slate-900">Sign in to StudentOps</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Continue to your organization workspace.</p>
      </header>
      <form noValidate onSubmit={handleSubmit} aria-labelledby="login-title" aria-busy={loading} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email address</label>
          <input id="login-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required
            value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading}
            aria-invalid={invalidField === 'email'} aria-describedby={invalidField === 'email' ? 'login-error' : undefined} className={authInputClass} />
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
          <PasswordField id="login-password" value={password} onChange={setPassword} autoComplete="current-password"
            disabled={loading} invalid={invalidField === 'password'} describedBy={invalidField === 'password' ? 'login-error' : undefined} />
          <div className="flex justify-end">
            <button ref={recoveryButton} type="button" onClick={() => setShowForgotModal(true)} className={`min-h-11 text-sm ${authLinkClass}`}>Forgot password?</button>
          </div>
        </div>
        {error && <p id="login-error" role="alert" className={authErrorClass}>{error}</p>}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p role="status" className="sr-only">{loading ? 'Signing in. Please wait.' : ''}</p>
      <p className="mt-8 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-600">
        New to StudentOps?{' '}<AuthLink href="/signup" onNavigate={onGoToRegister}>Create an account</AuthLink>
      </p>
      <div onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget.querySelector('[role="dialog"]');
        const buttons = dialog?.querySelectorAll<HTMLButtonElement>('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && (event.target === first || event.target === dialog)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        }
      }}>
        <Modal isOpen={showForgotModal} onClose={closeRecovery} title="Need help signing in?" size="sm">
          <div className="space-y-5 text-sm leading-6 text-slate-600">
            <p>Password recovery is not available on this page. Contact your organization administrator for help restoring access.</p>
            <p>No reset request has been sent.</p>
            <button type="button" onClick={closeRecovery} className={authButtonClass}>Back to sign in</button>
          </div>
        </Modal>
      </div>
    </AuthLayout>
  );
}

