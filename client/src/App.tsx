import { RouterProvider } from 'react-router-dom';
import { TicketProvider } from './context/TicketContext';
import { ThemeProvider as SettingsThemeProvider } from './modules/settings';
import { ThemeProvider as AppThemeProvider } from './context/theme/ThemeContext';
import { router } from './router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { ActiveProjectProvider } from './context/project/ActiveProjectContext';
import { ActiveViewProvider } from './context/ui/ActiveViewContext';
import { TicketFiltersProvider } from './context/filters/TicketFiltersContext';
import { CycleProvider } from './context/cycle/CycleContext';
import { LabelProvider } from './context/label/LabelContext';
import { TicketMutationProvider } from './context/ticket/TicketMutationContext';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <SettingsThemeProvider>
          <ActiveProjectProvider>
            <CycleProvider>
              <LabelProvider>
                <TicketFiltersProvider>
                  <ActiveViewProvider>
                    <TicketProvider>
                      <TicketMutationProvider>
                        <RouterProvider router={router} />
                      </TicketMutationProvider>
                    </TicketProvider>
                  </ActiveViewProvider>
                </TicketFiltersProvider>
              </LabelProvider>
            </CycleProvider>
          </ActiveProjectProvider>
        </SettingsThemeProvider>
      </AppThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
