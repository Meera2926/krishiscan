import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../components/ui.jsx';
import { useAuth } from './AuthProvider.jsx';

export function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
