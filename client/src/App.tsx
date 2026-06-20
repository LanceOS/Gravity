import { RouterProvider } from 'react-router-dom';
import { TicketProvider } from './context/TicketContext';
import { ThemeProvider as SettingsThemeProvider } from './modules/settings';
import { ThemeProvider as AppThemeProvider } from './context/theme/ThemeContext';
import { router } from './router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { ActiveProjectProvider } from './context/project/ActiveProjectContext';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <SettingsThemeProvider>
          <ActiveProjectProvider>
            <TicketProvider>
              <RouterProvider router={router} />
            </TicketProvider>
          </ActiveProjectProvider>
        </SettingsThemeProvider>
      </AppThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
