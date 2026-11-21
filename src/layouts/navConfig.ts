import {
  LayoutDashboard,
  CalendarDays,
  ListTodo,
  Bot,
  FileInput,
  Flag,
  Bell,
  History,
  Settings,
} from 'lucide-react';
import type { I18nKey } from '@/i18n';
import type { ModuleKey } from '@/types/enums';

export interface NavItem {
  to: string;
  module: ModuleKey;
  labelKey: I18nKey;
  icon: typeof LayoutDashboard;
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', module: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, primary: true },
  { to: '/calendar', module: 'calendar', labelKey: 'nav.calendar', icon: CalendarDays, primary: true },
  { to: '/tasks', module: 'tasks', labelKey: 'nav.tasks', icon: ListTodo, primary: true },
  { to: '/ai-assistant', module: 'ai_assistant', labelKey: 'nav.aiAssistant', icon: Bot, primary: true },
  { to: '/ai-import', module: 'ai_import', labelKey: 'nav.aiImport', icon: FileInput, primary: false },
  { to: '/deadlines', module: 'deadlines', labelKey: 'nav.deadlines', icon: Flag, primary: false },
  { to: '/notifications', module: 'notifications', labelKey: 'nav.notifications', icon: Bell, primary: false },
  { to: '/history', module: 'history', labelKey: 'nav.history', icon: History, primary: false },
  { to: '/settings', module: 'settings', labelKey: 'nav.settings', icon: Settings, primary: true },
];
