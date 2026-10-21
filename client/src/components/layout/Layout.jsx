import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
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
    <div className="min-h-screen flex flex-col">
      <Sidebar />

      {/* Page content sits beside the fixed glass rail on desktop.
          Remounts when the default currency changes (not on Settings, so its tab is kept) */}
      <main className="flex-1 flex flex-col overflow-x-clip lg:pl-[264px] print:pl-0">
        <div key={pathname + (pathname === '/settings' ? '' : '#' + version)} className="animate-page p-4 md:p-6 lg:pl-6 lg:pr-8 lg:py-6 flex-1">
          {ready ? <Outlet /> : null}
        </div>
      </main>
    </div>
  );
}
