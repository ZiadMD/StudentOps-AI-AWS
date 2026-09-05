import React, { useEffect, useRef, useState } from 'react';
import { Layers, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { UserProfile } from '../../types';

interface LoginPageProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
    if (!siteKey || !turnstileRef.current) return;

    const renderWidget = () => {
      const turnstile = (window as Window & { turnstile?: { render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => void } }).turnstile;
      if (turnstile && turnstileRef.current) {
        turnstile.render(turnstileRef.current, {
          sitekey: siteKey,
          callback: setTurnstileToken,
          'expired-callback': () => setTurnstileToken(''),
          'error-callback': () => setTurnstileToken(''),
        });
      }
    };

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (import.meta.env.PROD && import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken) {
      setError('Complete the human verification challenge.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.login({
        email: email.trim(),
        password: password.trim(),
        turnstile_token: turnstileToken,
      });
      onLogin(res.user);
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Left brand column — desktop only */}
      <div className="hidden lg:flex lg:w-[44%] flex-col justify-between bg-slate-900 p-12 relative overflow-hidden">
        {/* Subtle ambient radial glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.15) 0%, transparent 65%)' }} />

        <div className="relative z-10 flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-tight">
            StudentOps<span className="text-blue-400">.AI</span>
          </span>
        </div>

        <div className="relative z-10 space-y-6">
          <blockquote className="space-y-3">
            <p className="text-2xl font-bold text-white leading-snug tracking-tight">
              Agentic HR & Student Operations for Modern Organizations.
            </p>
            <p className="text-sm text-slate-400 leading-relaxed">
              Multi-role platform for managing members, attendance, task evaluations, and autonomous AI workflows — all in one unified workspace.
            </p>
          </blockquote>

          {/* Feature tiles */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              ['Meet Attendance', 'Auto-classify from Google Meet exports'],
              ['Evaluation Scores', 'Behavior and task quality grading engine'],
              ['AI ReAct Agent', 'Multi-turn tool-calling operations'],
              ['Human-in-Loop', 'Confirmation barrier on all actions'],
            ].map(([title, desc]) => (
              <div key={title} className="p-3 rounded-xl bg-white/5 border border-white/8">
                <div className="text-xs font-bold text-white mb-0.5">{title}</div>
                <div className="text-[11px] text-slate-400">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px] text-slate-600">
          © 2026 StudentOps AI — Engineering Branch
        </p>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center space-x-2 mb-10">
          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight">
            StudentOps<span className="text-blue-600">.AI</span>
          </span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sign in</h1>
            <p className="text-sm text-slate-500 mt-1.5">Use your organization-issued StudentOps account.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@organization.org"
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-slate-700" htmlFor="password">
                  Password
                </label>
                <button type="button" className="text-[11px] text-blue-600 hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div ref={turnstileRef} aria-label="Human verification" />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              By signing in, you agree to the internal data handling policy. All actions are logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
