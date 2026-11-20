import { RouterProvider } from 'react-router-dom';
import { I18nProvider } from '@/context/I18nContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { SyncProvider } from '@/context/SyncContext';
import { router } from '@/router';

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <PreferencesProvider>
            <SyncProvider>
              <RouterProvider router={router} />
            </SyncProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
