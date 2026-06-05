import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShellPage } from '../pages/AppShellPage/AppShellPage';
import { ProtectedRoute } from './ProtectedRoute';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

const PlaceholderPage = lazy(() => import('../pages/PlaceholderPage'));

export const router = createBrowserRouter([
  {
    path: '/placeholder/:id',
    element: (
      <ProtectedRoute>
        <Suspense fallback={<LoadingPage />}>
          <PlaceholderPage />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <AppShellPage />,
  },
]);
