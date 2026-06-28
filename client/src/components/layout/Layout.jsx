import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import api, { apiFetch, imgUrl } from '../../lib/api';
import { useAuth } from '../../lib/authContext';
import { Zap, X, Menu, Layers } from 'lucide-react';

function TrialBanner() {
  const { user } = useAuth();
  const [plan, setPlan]           = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get('/settings').then(r => {
      const s = r.data;
      if (s.plan && s.plan_expires_at && s.plan_status === 'active') {
        const daysLeft = Math.ceil((new Date(s.plan_expires_at) - new Date()) / 86400000);
        setPlan({ type: s.plan, daysLeft });
      }
    }).catch(() => {});
  }, [user]);

  if (!plan || dismissed) return null;
  const urgent = plan.daysLeft <= 7;
  const show   = plan.type === 'demo' || plan.daysLeft <= 10;
  if (!show) return null;

  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-xs font-medium print:hidden flex-wrap ${urgent ? 'bg-rose-600/90 text-white' : 'bg-amber-500/90 text-white'}`}>
      <Zap size={12} className="flex-shrink-0" />
      <span>{plan.type === 'demo' ? `Demo — ${plan.daysLeft}d left` : `Trial — ${plan.daysLeft}d left`}</span>
      {urgent && <span className="font-bold">Upgrade to keep your data.</span>}
      <a href="mailto:sales@apparelcrm.com" className="underline hover:no-underline whitespace-nowrap">Upgrade →</a>
      <button onClick={() => setDismissed(true)} className="ml-auto p-0.5 hover:opacity-70"><X size={12} /></button>
    </div>
  );
}

export default function Layout() {
  const { pathname }        = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appName, setAppName]         = useState('Apparel CRM');
  const [appLogo, setAppLogo]         = useState('');

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Load branding for mobile header
  useEffect(() => {
    const token = localStorage.getItem('crm_token');
    apiFetch('/api/settings', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(s => { if (s.app_name) setAppName(s.app_name); setAppLogo(s.app_logo || ''); })
      .catch(() => {});
    const handler = () => {
      const token2 = localStorage.getItem('crm_token');
      apiFetch('/api/settings', { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} })
        .then(r => r.json())
        .then(s => { if (s.app_name) setAppName(s.app_name); setAppLogo(s.app_logo || ''); })
        .catch(() => {});
    };
    window.addEventListener('branding-updated', handler);
    return () => window.removeEventListener('branding-updated', handler);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f2f2f7]">

      {/* Sidebar — always visible on lg+, drawer on mobile */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-x-hidden print:ml-0 lg:ml-60 flex flex-col">

        {/* Mobile top bar */}
        <div className="lg:hidden flex-shrink-0 sticky top-0 z-20 bg-[#1c1c1e] border-b border-white/[0.06] px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
              {appLogo
                ? <img src={imgUrl(appLogo)} alt="logo" className="w-full h-full object-contain" />
                : <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center"><Layers size={13} className="text-white" /></div>
              }
            </div>
            <span className="text-white font-semibold text-sm truncate">{appName}</span>
          </div>
        </div>

        {/* Trial banner */}
        <TrialBanner />

        {/* Page content */}
        <div key={pathname} className="animate-page p-4 md:p-6 lg:p-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
