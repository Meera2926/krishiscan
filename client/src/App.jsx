import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { RedirectIfAuthenticated, RequireAuth } from './auth/guards.jsx';
import Layout from './components/Layout.jsx';
import { FullPageSpinner } from './components/ui.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register } from './pages/Auth.jsx';
import { NotFound, RouteError } from './pages/Errors.jsx';

// Map-heavy and rarely-first pages load on demand to keep the first load small on 3G.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
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
            ],
          },
          {
            element: <RequireAuth />,
            children: [
              { path: 'dashboard', element: <Dashboard /> },
              { path: 'scan', element: <NewScan /> },
              { path: 'scans/:id', element: <ScanResult /> },
              { path: 'history', element: <History /> },
              { path: 'plots', element: <Plots /> },
              { path: 'plots/new', element: <PlotForm /> },
              { path: 'plots/:id', element: <PlotDetail /> },
              { path: 'plots/:id/edit', element: <PlotForm /> },
              { path: 'consultations', element: <Consultations /> },
              { path: 'consultations/:id', element: <ConsultationDetail /> },
              { path: 'profile', element: <Profile /> },
            ],
          },
          {
            element: <RequireAuth roles={['expert', 'admin']} />,
            children: [{ path: 'reviews', element: <ReviewQueue /> }],
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
