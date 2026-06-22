import { ReactNode } from 'react';
import { useAuth } from '../context/auth/AuthContext';
import { AuthScreen } from '../modules/auth';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}
