import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { Layers, Eye, EyeOff, LogIn, Mail, Copy, Check, ArrowLeft, KeyRound } from 'lucide-react';
import api from '../lib/api';

const inputCls = 'w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

// ── Forgot Password view ──────────────────────────────────────────────────
function ForgotPassword({ onBack }) {
  const [username,  setUsername]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [resetLink, setResetLink] = useState('');
  const [name,      setName]      = useState('');
  const [copied,    setCopied]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter your username or email.'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/auth/forgot-password', { username: username.trim() });
      if (data.token) {
        const link = `${window.location.origin}/reset-password?token=${data.token}`;
        setResetLink(link);
        setName(data.name || '');
      } else {
        // User not found — show generic success (security)
        setResetLink('not-found');
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally { setLoading(false); }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const el = document.getElementById('reset-link-text');
      el?.select();
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
          <KeyRound size={24} className="text-white" />
        </div>
        <h1 className="text-white text-2xl font-bold tracking-tight">Forgot Password</h1>
        <p className="text-white/40 text-sm mt-1">
          {resetLink ? 'Your reset link is ready' : 'Enter your username or email'}
        </p>
      </div>

      <div className="bg-[#1c1c1e] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
        {!resetLink ? (
          /* ── Step 1: Enter username ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin or admin@company.com"
                autoFocus
                className={inputCls}
              />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Mail size={16} />}
              {loading ? 'Generating link…' : 'Generate Reset Link'}
            </button>
          </form>
        ) : resetLink === 'not-found' ? (
          /* ── Account not found (generic) ── */
          <div className="text-center py-2">
            <div className="w-12 h-12 bg-amber-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
              <Mail size={20} className="text-amber-400" />
            </div>
            <p className="text-white font-semibold mb-2">Check with your admin</p>
            <p className="text-white/50 text-sm leading-relaxed">
              If that account exists, contact your Super Admin and ask them to reset your password from <span className="text-white/70 font-medium">Settings → Users</span>.
            </p>
          </div>
        ) : (
          /* ── Step 2: Show reset link ── */
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
              <Check size={15} className="text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-emerald-300 text-sm">
                Reset link generated for <span className="font-semibold text-white">{name}</span>. This link expires in <span className="font-semibold">1 hour</span>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Reset Link — open or copy
              </label>
              <div className="relative">
                <input
                  id="reset-link-text"
                  readOnly
                  value={resetLink}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 pr-12 text-white/60 text-xs outline-none font-mono select-all"
                  onClick={e => e.target.select()}
                />
                <button type="button" onClick={handleCopy}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/[0.08]">
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                </button>
              </div>
              <p className="text-white/25 text-xs mt-1.5">Click the field to select all · or copy and open in browser</p>
            </div>

            <a href={resetLink} target="_self"
              className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors text-center text-sm">
              Open Reset Link →
            </a>
          </div>
        )}
      </div>

      <button onClick={onBack}
        className="flex items-center justify-center gap-2 w-full mt-4 text-white/30 hover:text-white/60 text-sm transition-colors">
        <ArrowLeft size={14} /> Back to Sign In
      </button>
    </div>
  );
}

// ── Main Login view ───────────────────────────────────────────────────────
export default function Login() {
  const { login } = useAuth();
  const [view,     setView]     = useState('login'); // 'login' | 'forgot'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Enter username and password.'); return; }
    setLoading(true); setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err?.response?.data?.error || 'Login failed. Check your credentials.');
    } finally { setLoading(false); }
  }

  if (view === 'forgot') {
    return (
      <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center p-4">
        <ForgotPassword onBack={() => setView('login')} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
            <Layers size={26} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Apparel CRM</h1>
          <p className="text-white/40 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-[#1c1c1e] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                autoComplete="username"
                className={inputCls}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                  Password
                </label>
                <button type="button" onClick={() => setView('forgot')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`${inputCls} pr-11`}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2">
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <LogIn size={16} />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">© 2026 Apparel CRM</p>
      </div>
    </div>
  );
}
