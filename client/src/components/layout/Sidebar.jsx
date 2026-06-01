import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Receipt,
  TrendingUp, Users, Layers, Settings, Box, AlertTriangle, Flame, Store, Archive,
  UserCheck, Wallet, LayoutTemplate, LogOut, ChevronDown, KeyRound, Eye, EyeOff, Check, X, Menu,
} from 'lucide-react';
import { useDirty } from '../../lib/dirtyContext';
import { useAuth } from '../../lib/authContext';
import api, { apiFetch } from '../../lib/api';

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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
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

const ALL_NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Overview'   },
  { to: '/quotations', icon: FileText,        label: 'Quotations' },
  { to: '/invoices',   icon: Receipt,         label: 'Invoices'   },
  { to: '/products',   icon: Box,             label: 'Products'   },
  { to: '/projects',   icon: Flame,           label: 'Projects'   },
  { to: '/vendors',    icon: Store,           label: 'Vendors'    },
  { to: '/inventory',  icon: Archive,         label: 'Inventory'  },
  { to: '/payroll',    icon: UserCheck,       label: 'Employees'  },
  { to: '/expenses',   icon: Wallet,          label: 'Expenses'   },
  { to: '/financials', icon: TrendingUp,      label: 'Financials' },
  { to: '/clients',    icon: Users,           label: 'Clients'    },
  { to: '/templates',  icon: LayoutTemplate,  label: 'Templates'  },
  { to: '/settings',   icon: Settings,        label: 'Settings'   },
];

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { isDirty, setDirty } = useDirty();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingTo, setPendingTo]         = useState(null);
  const [userMenuOpen, setUserMenuOpen]   = useState(false);
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

  // Single-admin mode: show all nav items
  const nav = ALL_NAV;

  function handleNavClick(e, to) {
    setUserMenuOpen(false);
    if (isDirty) { e.preventDefault(); setPendingTo(to); }
  }

  function confirmLeave() {
    setDirty(false);
    const dest = pendingTo;
    setPendingTo(null);
    navigate(dest);
  }


  return (
    <aside className={`fixed left-0 top-0 h-screen w-72 lg:w-60 bg-[#1c1c1e] flex flex-col z-40 border-r border-white/[0.06] print:hidden
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
            {appLogo ? (
              <img src={appLogo} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 rounded-md flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Layers size={15} className="text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold text-sm leading-tight tracking-tight truncate">{appName}</p>
            <p className="text-white/30 text-2xs mt-0.5 tracking-wide">Management System</p>
          </div>
          {/* Close button — mobile only */}
          <button onClick={onClose} className="lg:hidden p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-px sidebar-nav">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={(e) => handleNavClick(e, to)}
            className={({ isActive }) =>
              `group relative flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium
               transition-all duration-150 select-none
               active:scale-[0.96] active:duration-75
               ${isActive
                 ? 'bg-indigo-600 text-white scale-[1.01]'
                 : 'text-white/55 hover:text-white hover:bg-white/[0.08] hover:scale-[1.01]'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} className={`flex-shrink-0 transition-transform duration-150 ${
                  isActive ? 'text-white' : 'text-white/40 group-hover:text-white/80 group-hover:scale-110'
                }`} />
                <span className="flex-1 truncate tracking-[-0.01em]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User panel */}
      <div className="px-2.5 py-2 border-t border-white/[0.06] flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white/80 text-xs font-semibold truncate leading-tight">{user?.name}</p>
              <p className="text-white/30 text-2xs truncate mt-0.5">{user?.email}</p>
            </div>
            <ChevronDown size={12} className={`text-white/30 flex-shrink-0 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#2c2c2e] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2.5 border-b border-white/[0.06]">
                <p className="text-white/40 text-xs truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); setChangePwdOpen(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <KeyRound size={14} />
                Change Password
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            </div>
          )}
        </div>
        <p className="text-white/15 text-2xs px-2 mt-1">© 2026 {appName}</p>
      </div>

      {/* Change Password Modal — portal so it escapes sidebar's transform context */}
      {changePwdOpen && createPortal(
        <ChangePasswordModal onClose={() => setChangePwdOpen(false)} />,
        document.body
      )}

      {/* Unsaved-changes confirmation — portal for true viewport-centered modal */}
      {pendingTo && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-modal">
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
              You have unsaved changes. If you leave now, everything you've added will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setPendingTo(null)}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">
                Stay & Save
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
    </aside>
  );
}
