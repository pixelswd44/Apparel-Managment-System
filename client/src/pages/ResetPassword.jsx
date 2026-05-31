import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, Eye, EyeOff, Check, X, KeyRound } from 'lucide-react';
import api from '../lib/api';

const inputCls = 'w-full bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all';

export default function ResetPassword() {
  const [params]       = useSearchParams();
  const token          = params.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userName,   setUserName]   = useState('');

  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [showPw,     setShowPw]     = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [error,      setError]      = useState('');

  // Validate token on mount
  useEffect(() => {
    if (!token) { setValidating(false); return; }
    api.get(`/auth/validate-reset-token/${token}`)
      .then(r => { setTokenValid(true); setUserName(r.data.name); })
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSaving(true); setError('');
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-[#0f0f11] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/30 mb-4">
            {success ? <Check size={26} className="text-white" /> : <KeyRound size={24} className="text-white" />}
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">
            {success ? 'Password Updated' : 'Set New Password'}
          </h1>
          <p className="text-white/40 text-sm mt-1">
            {validating ? 'Verifying link…'
              : success ? 'You can now sign in with your new password'
              : tokenValid ? `Setting password for ${userName}`
              : 'This link is invalid or expired'}
          </p>
        </div>

        <div className="bg-[#1c1c1e] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">

          {/* Loading */}
          {validating && (
            <div className="flex justify-center py-6">
              <span className="w-6 h-6 border-2 border-white/20 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          )}

          {/* Invalid / expired token */}
          {!validating && !tokenValid && (
            <div className="text-center py-2">
              <div className="w-12 h-12 bg-rose-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
                <X size={22} className="text-rose-400" />
              </div>
              <p className="text-white/60 text-sm leading-relaxed">
                This password reset link is <span className="text-rose-400 font-semibold">invalid or has expired</span>.
                Reset links are only valid for <strong className="text-white/70">1 hour</strong>.
              </p>
              <a href="/login"
                className="block mt-5 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm text-center">
                Back to Sign In
              </a>
              <p className="text-white/25 text-xs mt-3">Request a new link from the login screen</p>
            </div>
          )}

          {/* Success */}
          {!validating && success && (
            <div className="text-center py-2">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-4 mb-5 flex items-center gap-3">
                <Check size={18} className="text-emerald-400 flex-shrink-0" />
                <p className="text-emerald-300 text-sm text-left">
                  Your password has been changed successfully.
                </p>
              </div>
              <a href="/"
                className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm text-center">
                Sign In Now →
              </a>
            </div>
          )}

          {/* Reset form */}
          {!validating && tokenValid && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    autoFocus
                    className={`${inputCls} pr-11`}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 p-1 transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className={inputCls}
                />
              </div>

              {/* Strength hint */}
              {password.length > 0 && (
                <div className="flex gap-1.5">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      password.length >= i * 3
                        ? password.length >= 12 ? 'bg-emerald-500'
                          : password.length >= 8 ? 'bg-amber-400'
                          : 'bg-rose-500'
                        : 'bg-white/10'
                    }`} />
                  ))}
                  <span className="text-xs text-white/30 ml-1">
                    {password.length < 6 ? 'Too short' : password.length < 8 ? 'Weak' : password.length < 12 ? 'Good' : 'Strong'}
                  </span>
                </div>
              )}

              <button type="submit" disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2">
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <KeyRound size={16} />}
                {saving ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">© 2026 Apparel CRM</p>
      </div>
    </div>
  );
}
