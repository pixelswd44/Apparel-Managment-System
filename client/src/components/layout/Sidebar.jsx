import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Receipt, Users, Layers, Settings, Box, AlertTriangle, Flame,
  UserCheck, Wallet, LogOut, ChevronUp, KeyRound, Eye, EyeOff, Check, X, Menu, BookMarked,
} from 'lucide-react';
import { useDirty } from '../../lib/dirtyContext';
import { useAuth } from '../../lib/authContext';
import api, { apiFetch, imgUrl } from '../../lib/api';

// ── Change Password Modal ─────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showCur,  setShowCur]  = useState(false);
  const [showNew,  setShowNew]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!current)             return setError('Enter your current password.');
    if (next.length < 6)      return setError('New password must be at least 6 characters.');
    if (next !== confirm)     return setError('Passwords do not match.');
    setSaving(true); setError('');
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to change password.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center">
              <KeyRound size={16} className="text-indigo-600" />
            </div>
            <h3 className="font-bold text-slate-900">Change Password</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><X size={16} /></button>
        </div>

        {success ? (
          <div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 mb-4">
              <Check size={18} className="text-emerald-600 flex-shrink-0" />
              <p className="text-sm text-emerald-700 font-medium">Password changed successfully!</p>
            </div>
            <button onClick={onClose} className="w-full py-2.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 transition-colors font-medium">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Current Password</label>
              <div className="relative">
                <input type={showCur ? 'text' : 'password'} value={current} onChange={e => setCurrent(e.target.value)}
                  placeholder="Your current password"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm pr-10 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
                <button type="button" onClick={() => setShowCur(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showCur ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">New Password</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={next} onChange={e => setNext(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm pr-10 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
                <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm New Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors font-medium">
                {saving ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Sidebar navigation: single links and labelled groups.
const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { label: 'Sales', items: [
    { to: '/clients',    icon: Users,    label: 'Clients' },
    { to: '/quotations', icon: FileText, label: 'Quotations' },
    { to: '/invoices',   icon: Receipt,  label: 'Invoices' },
  ] },
  { label: 'Work', items: [
    { to: '/projects', icon: Flame, label: 'Projects' },
    { to: '/products', icon: Box,   label: 'Products' },
  ] },
  { label: 'Finance', items: [
    { to: '/expenses', icon: Wallet,     label: 'Expenses' },
    { to: '/ledger',   icon: BookMarked, label: 'Ledger' },
  ] },
  { label: '', items: [
    { to: '/payroll',  icon: UserCheck, label: 'Employees' },
    { to: '/settings', icon: Settings,  label: 'Settings' },
  ] },
];

export default function Sidebar() {
  const { isDirty, setDirty } = useDirty();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pendingTo, setPendingTo]         = useState(null);
  const [userMenuOpen, setUserMenuOpen]   = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false); // mobile drawer
  const [changePwdOpen, setChangePwdOpen] = useState(false);

  // ── App Branding ─────────────────────────────────────────────────────────
  const [appName, setAppName] = useState('Apparel CRM');
  const [appLogo, setAppLogo] = useState('');

  useEffect(() => {
    async function loadBranding() {
      try {
        const token = localStorage.getItem('crm_token');
        const s = await apiFetch('/api/settings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then(r => r.json());
        if (s.app_name) { setAppName(s.app_name); document.title = s.app_name; }
        setAppLogo(s.app_logo || '');
      } catch {}
    }
    loadBranding();
    window.addEventListener('branding-updated', loadBranding);
    return () => window.removeEventListener('branding-updated', loadBranding);
  }, []);

  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); }, [pathname]);

  function handleNavClick(e, to) {
    setUserMenuOpen(false);
    setMenuOpen(false);
    if (isDirty) { e.preventDefault(); setPendingTo(to); }
  }

  function confirmLeave() {
    setDirty(false);
    const dest = pendingTo;
    setPendingTo(null);
    navigate(dest);
  }

  const logo = size => (
    <div className={`${size} rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-b from-[#3a3a40] to-[#1d1d1f] shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_4px_10px_-4px_rgba(0,0,0,.4)]`}>
      {appLogo
        ? <img src={imgUrl(appLogo)} alt="logo" className="w-full h-full object-contain bg-white" />
        : <Layers size={15} className="text-white" />}
    </div>
  );

  const initial = user?.name?.charAt(0)?.toUpperCase() || '?';

  const link = ({ to, icon: Icon, label }) => (
    <NavLink key={to} to={to} end={to === '/'} onClick={e => handleNavClick(e, to)}
      className="nav-item flex items-center gap-3 pl-1.5 pr-3 py-1 rounded-full text-sm font-medium text-[#3a3a3f]">
      <span className="nav-icon w-7 h-7 rounded-full grid place-items-center flex-shrink-0 bg-white/70 text-[#515154] shadow-[inset_0_1px_0_rgba(255,255,255,.95),0_1px_3px_rgba(30,41,82,.08)] transition-colors">
        <Icon size={14} />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );

  // Shared sidebar body — used by the fixed desktop rail and the mobile drawer
  const body = (
    <>
      <div className="flex items-center gap-3 px-2 pt-1 pb-3">
        {logo('w-10 h-10')}
        <div className="min-w-0">
          <p className="font-semibold text-[#1d1d1f] text-[15px] tracking-tight truncate">{appName}</p>
          <p className="text-[11px] text-[#86868b] truncate">Business workspace</p>
        </div>
      </div>

      <nav className="sidebar-nav flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2">
        {NAV.map(item => item.items ? (
          <div key={item.label || item.items[0].to} className="mt-2.5">
            {item.label && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">{item.label}</p>}
            <div className="space-y-0.5">{item.items.map(link)}</div>
          </div>
        ) : (
          <div key={item.to} className="space-y-0.5">{link(item)}</div>
        ))}
      </nav>

      {/* User card + menu */}
      <div className="relative pt-2 border-t border-white/60">
        <button onClick={() => setUserMenuOpen(v => !v)}
          className="w-full flex items-center gap-2.5 p-1.5 pr-3 rounded-full hover:bg-white/60 transition-colors text-left">
          <span className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4aa3ff] to-[#0071e3] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[#1d1d1f] truncate">{user?.name}</span>
            <span className="block text-[11px] text-[#86868b] truncate">{user?.email}</span>
          </span>
          <ChevronUp size={14} className={`text-[#86868b] transition-transform duration-300 ${userMenuOpen ? '' : 'rotate-180'}`} />
        </button>
        {userMenuOpen && (
          <>
            {/* Click-away layer sits under the rail (z-30), portalled so the rail's blur can't confine it */}
            {createPortal(<div className="fixed inset-0 z-[29]" onClick={() => setUserMenuOpen(false)} />, document.body)}
            <div className="absolute left-0 right-0 bottom-full mb-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden p-1.5">
              <button onClick={() => { setUserMenuOpen(false); setChangePwdOpen(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-slate-700 hover:bg-white/80 transition-colors text-left">
                <KeyRound size={14} /> Change Password
              </button>
              <button onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left">
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop: fixed floating glass rail ── */}
      <aside className="print:hidden hidden lg:flex flex-col fixed top-4 bottom-4 left-4 w-[248px] z-30 glass rounded-[30px] p-3">
        {body}
      </aside>

      {/* ── Mobile: frosted top bar ── */}
      <header className="print:hidden lg:hidden sticky top-0 z-30 glass !border-x-0 !border-t-0 !rounded-none px-3 h-[57px] flex items-center gap-3">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu"
          className="w-10 h-10 grid place-items-center rounded-full text-[#1d1d1f] hover:bg-white/60 transition-colors">
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {logo('w-8 h-8')}
          <span className="text-[#1d1d1f] font-semibold text-[15px] truncate">{appName}</span>
        </div>
        <button onClick={() => setMenuOpen(true)} aria-label="Account"
          className="w-9 h-9 rounded-full bg-gradient-to-b from-[#4aa3ff] to-[#0071e3] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
          {initial}
        </button>
      </header>

      {/* ── Mobile: slide-in drawer (outside the header so the header's blur can't trap it) ── */}
      {menuOpen && (
        <div className="lg:hidden print:hidden">
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setMenuOpen(false)} />
          <aside className="fixed top-2 bottom-2 left-2 w-[272px] max-w-[85vw] z-50 glass-strong rounded-[28px] p-3 flex flex-col animate-drawer-left">
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu"
              className="absolute top-3.5 right-3 w-8 h-8 grid place-items-center rounded-full text-[#515154] hover:bg-white/70 transition-colors z-10">
              <X size={17} />
            </button>
            {body}
          </aside>
        </div>
      )}

      {changePwdOpen && createPortal(<ChangePasswordModal onClose={() => setChangePwdOpen(false)} />, document.body)}

      {pendingTo && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-modal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Unsaved Changes</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your work will be lost</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              You have unsaved changes. If you leave now, everything you have added will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPendingTo(null)}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                Stay &amp; Save
              </button>
              <button onClick={confirmLeave}
                className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors font-medium">
                Leave Anyway
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
