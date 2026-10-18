import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Receipt, Users, Layers, Settings, Box, AlertTriangle, Flame,
  UserCheck, Wallet, LogOut, ChevronDown, KeyRound, Eye, EyeOff, Check, X, Menu, BookMarked,
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
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <KeyRound size={16} className="text-indigo-600" />
            </div>
            <h3 className="font-bold text-slate-900">Change Password</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"><X size={16} /></button>
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

// Top navigation: single links and dropdown groups, like the reference design.
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
  { to: '/payroll',  icon: UserCheck, label: 'Employees' },
  { to: '/settings', icon: Settings,  label: 'Settings' },
];

const isOn = (pathname, to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/'));

export default function TopNav() {
  const { isDirty, setDirty } = useDirty();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [pendingTo, setPendingTo]         = useState(null);
  const [userMenuOpen, setUserMenuOpen]   = useState(false);
  const [groupOpen, setGroupOpen]         = useState(null); // label of the open dropdown
  const [menuOpen, setMenuOpen]           = useState(false); // mobile menu
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

  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); setGroupOpen(null); }, [pathname]);

  function handleNavClick(e, to) {
    setUserMenuOpen(false);
    setMenuOpen(false);
    setGroupOpen(null);
    if (isDirty) { e.preventDefault(); setPendingTo(to); }
  }

  function confirmLeave() {
    setDirty(false);
    const dest = pendingTo;
    setPendingTo(null);
    navigate(dest);
  }

  const logo = (
    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-[#262626]">
      {appLogo
        ? <img src={imgUrl(appLogo)} alt="logo" className="w-full h-full object-contain" />
        : <Layers size={15} className="text-white" />}
    </div>
  );

  const userMenu = (
    <div className="relative">
      <button onClick={() => setUserMenuOpen(v => !v)} title={user?.name}
        className="flex items-center gap-1.5 p-1 pr-2 rounded-full bg-white/85 border border-white shadow-sm hover:bg-white transition-colors">
        <span className="w-9 h-9 rounded-full bg-[#f9c846] text-[#262626] text-sm font-semibold flex items-center justify-center">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
      </button>
      {userMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 bg-white border border-[#efe6d0] rounded-3xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#f4ecd6]">
              <p className="text-sm font-semibold text-slate-800 truncate">{user?.name}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button onClick={() => { setUserMenuOpen(false); setChangePwdOpen(true); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-600 hover:bg-[#fbf6e8] transition-colors text-left">
              <KeyRound size={14} /> Change Password
            </button>
            <button onClick={logout}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );

  const pill = on => `flex items-center gap-1 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors select-none ${
    on ? 'bg-[#262626] text-white' : 'text-[#4b4638] hover:bg-[#fbf0cc]'}`;

  return (
    <header className="print:hidden sticky top-0 lg:static z-30">

      {/* ── Desktop: logo pill · nav pill · avatar ── */}
      <div className="hidden lg:flex items-center justify-between gap-4 px-8 pt-5 pb-1">
        <div className="flex items-center gap-2.5 pl-1.5 pr-5 py-1.5 rounded-full bg-white/85 border border-white shadow-sm flex-shrink-0">
          {logo}
          <span className="font-medium text-[#232323] text-base tracking-tight">{appName}</span>
        </div>

        <nav className="flex items-center gap-0.5 p-1.5 rounded-full bg-white/85 border border-white shadow-sm min-w-0">
          {NAV.map(item => item.items ? (
            <div key={item.label} className="relative">
              <button onClick={() => setGroupOpen(g => (g === item.label ? null : item.label))}
                className={pill(item.items.some(i => isOn(pathname, i.to)))}>
                {item.label}
                <ChevronDown size={13} className={`transition-transform ${groupOpen === item.label ? 'rotate-180' : ''}`} />
              </button>
              {groupOpen === item.label && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setGroupOpen(null)} />
                  <div className="absolute left-1/2 -translate-x-1/2 mt-3 min-w-[190px] bg-white border border-[#efe6d0] rounded-3xl shadow-xl z-50 p-2">
                    {item.items.map(({ to, icon: Icon, label }) => (
                      <NavLink key={to} to={to} onClick={e => handleNavClick(e, to)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-medium transition-colors ${isActive ? 'bg-[#262626] text-white' : 'text-[#4b4638] hover:bg-[#fbf0cc]'}`}>
                        <Icon size={15} /> {label}
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={e => handleNavClick(e, item.to)}
              className={({ isActive }) => pill(isActive)}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {userMenu}
      </div>

      {/* ── Mobile: dark bar + dropdown menu ── */}
      <div className="lg:hidden bg-[#1c1c1e] border-b border-white/[0.06] px-4 py-[7px] flex items-center gap-3">
        <button onClick={() => setMenuOpen(v => !v)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-white/10">
            {appLogo ? <img src={imgUrl(appLogo)} alt="logo" className="w-full h-full object-contain" /> : <Layers size={13} className="text-white" />}
          </div>
          <span className="text-white font-semibold text-sm truncate">{appName}</span>
        </div>
        {userMenu}
      </div>
      {menuOpen && (
        <>
          <div className="lg:hidden fixed inset-0 top-[57px] bg-black/40 z-30" onClick={() => setMenuOpen(false)} />
          <nav className="lg:hidden absolute left-0 right-0 top-full z-40 bg-white border-b border-[#efe6d0] shadow-xl rounded-b-3xl p-3 grid grid-cols-2 gap-1.5">
            {NAV.flatMap(i => i.items || [i]).map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={e => handleNavClick(e, to)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-4 py-3 rounded-full text-sm font-medium ${isActive ? 'bg-[#262626] text-white' : 'text-[#4b4638] hover:bg-[#fbf0cc]'}`}>
                <Icon size={15} /> {label}
              </NavLink>
            ))}
          </nav>
        </>
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
    </header>
  );
}
