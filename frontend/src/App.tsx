import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { AdminPanel } from './pages/AdminPanel';
import { SuperAdminPanel } from './pages/SuperAdminPanel';
import { SetupDetail } from './pages/SetupDetail';
import { useAuth } from './context/AuthContext';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { telemetryTracker } from './services/telemetryTracker';

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isImpersonating, originalAdmin } = useAuth();
  if (isImpersonating && (originalAdmin?.role === 'admin' || originalAdmin?.role === 'super_admin')) {
    return <>{children}</>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function ProtectedSuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isImpersonating, originalAdmin } = useAuth();
  if (isImpersonating && originalAdmin?.role === 'super_admin') {
    return <>{children}</>;
  }
  if (!user || user.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function App() {
  const location = useLocation();

  useEffect(() => {
    telemetryTracker.trackPageView(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <ImpersonationBanner />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/client" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/admin" 
          element={
            <ProtectedAdminRoute>
              <AdminPanel />
            </ProtectedAdminRoute>
          } 
        />
        <Route 
          path="/super-admin" 
          element={
            <ProtectedSuperAdminRoute>
              <SuperAdminPanel />
            </ProtectedSuperAdminRoute>
          } 
        />
        <Route path="/setup/:id" element={<SetupDetail />} />
      </Routes>
    </>
  );
}

export default App;
