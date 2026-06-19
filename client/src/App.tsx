import { RouterProvider } from 'react-router-dom';
import { TicketProvider } from './context/TicketContext';
import { ThemeProvider } from './modules/settings';
import { router } from './router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { ActiveProjectProvider } from './context/project/ActiveProjectContext';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ActiveProjectProvider>
          <TicketProvider>
            <RouterProvider router={router} />
          </TicketProvider>
        </ActiveProjectProvider>
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

