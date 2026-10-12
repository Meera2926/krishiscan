import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider, isUnverifiedExpert, useAuth } from './auth/AuthProvider.jsx';
import { RedirectIfAuthenticated, RequireAuth } from './auth/guards.jsx';
import Layout from './components/Layout.jsx';
import { FullPageSpinner } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';
import { NotFound, RouteError } from './pages/Errors.jsx';

// Map-heavy and rarely-first pages load on demand to keep the first load small on 3G.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ExpertDashboard = lazy(() => import('./pages/ExpertDashboard.jsx'));
const NewScan = lazy(() => import('./pages/NewScan.jsx'));
const ScanResult = lazy(() => import('./pages/ScanResult.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Plots = lazy(() => import('./pages/Plots.jsx'));
const PlotForm = lazy(() => import('./pages/PlotForm.jsx'));
const PlotDetail = lazy(() => import('./pages/PlotDetail.jsx'));
const Library = lazy(() => import('./pages/Library.jsx'));
const DiseaseDetail = lazy(() => import('./pages/DiseaseDetail.jsx'));
const Outbreaks = lazy(() => import('./pages/Outbreaks.jsx'));
const ReviewQueue = lazy(() => import('./pages/ReviewQueue.jsx'));
const Consultations = lazy(() => import('./pages/Consultations.jsx'));
const ConsultationDetail = lazy(() => import('./pages/ConsultationDetail.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const ExpertApply = lazy(() => import('./pages/ExpertApply.jsx'));
const ExpertStatus = lazy(() => import('./pages/ExpertStatus.jsx'));
const ExpertProfile = lazy(() => import('./pages/ExpertProfile.jsx'));
const AdminExperts = lazy(() => import('./pages/AdminExperts.jsx'));

/**
 * A farmer and an expert want opposite things from a home screen — one tracks their own plots,
 * the other works a queue of other people's — so /dashboard resolves by role rather than
 * stacking both sets of panels into one page. An expert still waiting to be checked has no queue
 * to work yet, so their home is the state of their application.
 */
function DashboardRoute() {
  const { user } = useAuth();
  if (isUnverifiedExpert(user)) return <ExpertStatus />;
  return ['expert', 'admin'].includes(user?.role) ? <ExpertDashboard /> : <Dashboard />;
}

function Root() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Landing /> },
          { path: 'library', element: <Library /> },
          { path: 'library/:key', element: <DiseaseDetail /> },
          { path: 'outbreaks', element: <Outbreaks /> },
          {
            element: <RedirectIfAuthenticated />,
            children: [
              { path: 'login', element: <Login /> },
              { path: 'register', element: <Register /> },
              { path: 'register/expert', element: <ExpertApply /> },
            ],
          },
          {
            element: <RequireAuth />,
            children: [
              { path: 'dashboard', element: <DashboardRoute /> },
              { path: 'profile', element: <Profile /> },
            ],
          },
          {
            // Farmers' cases and photos: never shown to an expert nobody has checked yet.
            element: <RequireAuth verifiedExpert />,
            children: [
              // An expert opens a farmer's scan from a consultation, so this one stays shared.
              { path: 'scans/:id', element: <ScanResult /> },
              { path: 'consultations', element: <Consultations /> },
              { path: 'consultations/:id', element: <ConsultationDetail /> },
              { path: 'experts/:id', element: <ExpertProfile /> },
            ],
          },
          {
            // A farmer's own crop: an expert has no plots and no scan history to look at.
            element: <RequireAuth roles={['farmer']} />,
            children: [
              { path: 'scan', element: <NewScan /> },
              { path: 'history', element: <History /> },
              { path: 'plots', element: <Plots /> },
              { path: 'plots/new', element: <PlotForm /> },
              { path: 'plots/:id', element: <PlotDetail /> },
              { path: 'plots/:id/edit', element: <PlotForm /> },
            ],
          },
          {
            element: <RequireAuth roles={['expert', 'admin']} verifiedExpert />,
            children: [{ path: 'reviews', element: <ReviewQueue /> }],
          },
          {
            // Correcting and resending an application that is pending or was turned down.
            element: <RequireAuth roles={['expert']} />,
            children: [{ path: 'expert/application', element: <ExpertApply resubmit /> }],
          },
          {
            element: <RequireAuth roles={['admin']} />,
            children: [{ path: 'admin/experts', element: <AdminExperts /> }],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
