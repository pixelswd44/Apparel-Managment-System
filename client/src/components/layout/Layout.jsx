import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import TopNav from './TopNav';
import api from '../../lib/api';
import { setDisplayCurrency } from '../../lib/currency';

export default function Layout() {
  const { pathname } = useLocation();
  const [ready, setReady]     = useState(false);
  const [version, setVersion] = useState(0);

  // The default currency (Settings → Currencies) decides how every PKR figure is shown.
  useEffect(() => {
    let live = true;
    const load = () => api.get('/currencies')
      .then(r => { setDisplayCurrency(Array.isArray(r.data) ? r.data : []); })
      .catch(() => {})
      .finally(() => { if (live) { setReady(true); setVersion(v => v + 1); } });
    load();
    window.addEventListener('currencies-updated', load);
    return () => { live = false; window.removeEventListener('currencies-updated', load); };
  }, []);

  return (
    <div className="warm-theme min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg,#f8edcf 0%,#fcf5e4 38%,#fffdf8 100%)' }}>
      <TopNav />

      {/* Page content — remounts when the default currency changes (not on Settings, so its tab is kept) */}
      <main className="flex-1 flex flex-col overflow-x-clip">
        <div key={pathname + (pathname === '/settings' ? '' : '#' + version)} className="animate-page p-4 md:p-6 lg:px-8 lg:py-6 flex-1">
          {ready ? <Outlet /> : null}
        </div>
      </main>
    </div>
  );
}
