import { lazy, Suspense } from 'react';
import { NotificationCenter } from '@library';
import { RouterProvider } from 'react-router-dom';
import { AppContextProviders } from './context/TicketContext';
import { router } from './router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './utils/queryClient';

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then(({ ReactQueryDevtools }) => ({ default: ReactQueryDevtools })))
  : null;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContextProviders>
        <RouterProvider router={router} />
        <NotificationCenter />
      </AppContextProviders>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
