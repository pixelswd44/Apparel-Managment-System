import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { apiFetch, imgUrl } from '../../lib/api';
import { Menu, Layers } from 'lucide-react';

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
      <main className="flex-1 min-h-screen overflow-x-clip print:ml-0 lg:ml-60 flex flex-col">

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

        {/* Page content */}
        <div key={pathname} className="animate-page p-4 md:p-6 lg:p-8 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
