import { ReactNode } from 'react';
import { useAuth } from '../context/auth/AuthContext';
import { useProjectContext } from '../context/project/ProjectContext';
import { AuthScreen } from '../modules/auth';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading: authLoading } = useAuth();
  const { projectsLoading } = useProjectContext();
  const loading = authLoading || projectsLoading;

  if (loading) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}
