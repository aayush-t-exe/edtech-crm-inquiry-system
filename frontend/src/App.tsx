import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './lib/auth';
import { InquiryPage } from './pages/InquiryPage';

// The admin side is split into its own bundle; public visitors never download it.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));

function FullPageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

// Session state only exists under /admin, so the public form never calls the auth API.
function AdminLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

// Client-side guard for the dashboard. The real protection is server-side: every
// /api/admin request is checked by the requireAdmin middleware.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { admin, checking } = useAuth();
  const location = useLocation();
  if (checking) return <FullPageLoader />;
  if (!admin) return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

export function App() {
  return (
    <>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<InquiryPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route
              index
              element={
                <RequireAdmin>
                  <DashboardPage />
                </RequireAdmin>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-body)' } }} />
    </>
  );
}
