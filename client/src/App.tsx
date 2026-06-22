import { RouterProvider } from 'react-router-dom';
import { AppContextProviders } from './context/TicketContext';
import { router } from './router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContextProviders>
        <RouterProvider router={router} />
      </AppContextProviders>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
