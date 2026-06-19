import { ReactNode } from 'react';
import { useTickets } from '../context/TicketContextContext';
import { AuthScreen } from '../modules/auth';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useTickets();

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}
