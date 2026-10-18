import { Outlet, useLocation } from 'react-router-dom';
import TopNav from './TopNav';

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="warm-theme min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg,#f8edcf 0%,#fcf5e4 38%,#fffdf8 100%)' }}>
      <TopNav />

      {/* Page content */}
      <main className="flex-1 flex flex-col overflow-x-clip">
        <div key={pathname} className="animate-page p-4 md:p-6 lg:px-8 lg:py-6 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
