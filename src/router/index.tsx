import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { LoadingState } from '@/components/ui/LoadingState';
import { useAuth } from '@/hooks/useAuth';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const TasksPage = lazy(() => import('@/pages/TasksPage'));
const AiAssistantPage = lazy(() => import('@/pages/AiAssistantPage'));
const AiImportPage = lazy(() => import('@/pages/AiImportPage'));
const DeadlinesPage = lazy(() => import('@/pages/DeadlinesPage'));
const SmartPlanningPage = lazy(() => import('@/pages/SmartPlanningPage'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<LoadingState />}>{node}</Suspense>;
}

/** 路由守卫：会话加载中显示 Loading；未登录重定向 /login，已登录放行 */
function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** 登录页守卫：已登录用户访问 /login 时直接回首页 */
function GuestRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return withSuspense(<LoginPage />);
}

export const router = createBrowserRouter([
  { path: '/login', element: <GuestRoute /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: withSuspense(<DashboardPage />) },
          { path: '/calendar', element: withSuspense(<CalendarPage />) },
          { path: '/tasks', element: withSuspense(<TasksPage />) },
          { path: '/ai-assistant', element: withSuspense(<AiAssistantPage />) },
          { path: '/ai-import', element: withSuspense(<AiImportPage />) },
          { path: '/deadlines', element: withSuspense(<DeadlinesPage />) },
          { path: '/smart-planning', element: withSuspense(<SmartPlanningPage />) },
          { path: '/notifications', element: withSuspense(<NotificationsPage />) },
          { path: '/history', element: withSuspense(<HistoryPage />) },
          { path: '/settings', element: withSuspense(<SettingsPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
