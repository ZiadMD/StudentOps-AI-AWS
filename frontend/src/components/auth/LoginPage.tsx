import React, { useState } from 'react';
import { Layers, Eye, EyeOff, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { UserProfile } from '../../types';

const DEMO_ACCOUNTS = [
  {
    roleName: 'HR Region / HR Head',
    arabicRole: 'رئيس الموارد البشرية للإقليم',
    email: 'region.head@studentops.org',
    password: 'head123',
    badge: 'Oversight & Reports',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    roleName: 'HR Leader',
    arabicRole: 'قائد الموارد البشرية للجنة',
    email: 'hr.leader@studentops.org',
    password: 'leader123',
    badge: 'Scores, Feedback & Reports',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    roleName: 'Social Media Committee Head',
    arabicRole: 'رئيس لجنة السوشيال ميديا',
    email: 'media.head@studentops.org',
    password: 'lead123',
    badge: 'Tasks, Sessions & Q&A',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    roleName: 'Social Media HR Member',
    arabicRole: 'عضو الموارد البشرية باللجنة',
    email: 'hr.member@studentops.org',
    password: 'hrmember123',
    badge: 'Attendance & WhatsApp Flags',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    roleName: 'Social Media Committee Member',
    arabicRole: 'عضو لجنة السوشيال ميديا',
    email: 'member@studentops.org',
    password: 'member123',
    badge: 'Deliverables & Questions',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
  },
];

interface LoginPageProps {
  onLogin: (user: UserProfile) => void;
  onGoToRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onGoToRegister }) => {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email or username and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await api.login({
        email: email.trim(),
        password: password.trim()
      });
      onLogin(res.user);
    } catch (err: any) {
      setError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demo: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(demo.email);
    setPassword(demo.password);
    setError('');
    setLoading(true);
    try {
      const res = await api.login({
        email: demo.email,
        password: demo.password
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
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-10 overflow-y-auto">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center space-x-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight">
            StudentOps<span className="text-blue-600">.AI</span>
          </span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sign in</h1>
            <p className="text-sm text-slate-500 mt-1">
              Don't have an account?{' '}
              <button onClick={onGoToRegister} className="text-blue-600 font-semibold hover:underline">
                Create one
              </button>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email / Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700" htmlFor="email">
                Email address or Username
              </label>
              <input
                id="email"
                type="text"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. media.head@studentops.org or media.head"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign in</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Accounts Selector */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-900 tracking-tight">1-Click Demo Accounts</span>
              <span className="text-[11px] text-slate-400 font-medium">Social Media Committee</span>
            </div>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleDemoLogin(acc)}
                  disabled={loading}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center justify-between group cursor-pointer shadow-xs"
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900 truncate">{acc.roleName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${acc.badgeColor}`}>
                        {acc.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{acc.email}</div>
                  </div>
                  <span className="text-xs text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pl-2">
                    Login →
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              By signing in, you agree to the internal data handling policy. All actions are logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
