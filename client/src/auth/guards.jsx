import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '../components/ui.jsx';
import { isUnverifiedExpert, useAuth } from './AuthProvider.jsx';

/**
 * `verifiedExpert` guards the pages that show farmers' cases. The server refuses them to an
 * expert nobody has checked yet; sending them home here saves them a page full of errors.
 */
export function RequireAuth({ roles, verifiedExpert = false }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  if (verifiedExpert && isUnverifiedExpert(user)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
