import { ReactNode } from 'react';
import { useProjectContext } from '../context/project/ProjectContext';
import { useCurrentUser } from '../context/auth/useCurrentUser';
import { AuthScreen } from '../modules/auth';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { currentUser, loading: authLoading } = useCurrentUser();
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
