import React, { useState } from 'react';
import { Layers, Eye, EyeOff, ChevronRight, Check } from 'lucide-react';

type Role = 'hr_admin' | 'team_lead' | 'member';

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'hr_admin',  label: 'HR Admin',   description: 'Full access — manage all members, tasks, and AI agent actions' },
  { value: 'team_lead', label: 'Team Lead',  description: 'Manage your team tasks, reviews, and meeting attendance'         },
  { value: 'member',    label: 'Member',     description: 'View your personal attendance, scores, and task history'           },
];

interface RegisterPageProps {
  onRegister: (role: Role) => void;
  onGoToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onRegister, onGoToLogin }) => {
  const [step, setStep]           = useState<1 | 2>(1);
  const [role, setRole]           = useState<Role>('member');
  const [name, setName]           = useState('');
  const [arabicName, setArabicName] = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) { setError('Please select a role.'); return; }
    setError('');
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onRegister(role);
    }, 900);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center space-x-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-slate-900 text-lg tracking-tight">
            StudentOps<span className="text-blue-600">.AI</span>
          </span>
        </div>

        {/* Step progress */}
        <div className="flex items-center space-x-3 mb-8">
          {[1, 2].map((s) => (
            <React.Fragment key={s}>
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
              }`}>
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 2 && <div className={`flex-1 h-px ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1 — Role selection */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-6">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Create an account</h1>
              <p className="text-sm text-slate-500 mt-1.5">
                Already have one?{' '}
                <button type="button" onClick={onGoToLogin} className="text-blue-600 font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Your Role</label>
              <div className="space-y-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start space-x-3 ${
                      role === r.value
                        ? 'bg-blue-50 border-blue-400 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      role === r.value ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                    }`}>
                      {role === r.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${role === r.value ? 'text-blue-700' : 'text-slate-800'}`}>
                        {r.label}
                      </div>
                      <div className="text-[12px] text-slate-500 mt-0.5">{r.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center space-x-2"
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Step 2 — Profile details */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Your profile</h1>
              <p className="text-sm text-slate-500 mt-1.5">
                Registering as <span className="font-semibold text-slate-800">{ROLES.find(r => r.value === role)?.label}</span>
                {' '}&mdash;{' '}
                <button type="button" onClick={() => setStep(1)} className="text-blue-600 font-semibold hover:underline">
                  Change
                </button>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Full Name (EN)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maurine Magdy"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">الاسم بالعربية</label>
                <input
                  type="text"
                  dir="rtl"
                  value={arabicName}
                  onChange={(e) => setArabicName(e.target.value)}
                  placeholder="مورين مجدي"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs font-cairo"
                  style={{ fontFamily: 'Cairo, sans-serif' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@engineering.org"
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-3 py-2.5 pr-10 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength bar */}
              {password && (
                <div className="flex space-x-1 mt-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= i * 3
                        ? password.length < 6 ? 'bg-rose-400' : password.length < 10 ? 'bg-amber-400' : 'bg-emerald-500'
                        : 'bg-slate-200'
                    }`} />
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold rounded-lg text-sm transition-all shadow-sm flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
