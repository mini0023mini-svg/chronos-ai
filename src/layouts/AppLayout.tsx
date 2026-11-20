import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { useDueReminders } from '@/hooks/useDueReminders';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { TopBar } from './TopBar';

export function AppLayout() {
  useDueReminders();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('chronos.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('chronos.sidebarCollapsed', String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-canvas">
      <DesktopSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-10">
          <InstallPrompt />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
