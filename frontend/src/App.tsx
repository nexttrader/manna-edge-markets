import { Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { AdminPanel } from './pages/AdminPanel';
import { SetupDetail } from './pages/SetupDetail';
import { useAuth } from './context/AuthContext';
import { ImpersonationBanner } from './components/ImpersonationBanner';

function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isImpersonating, originalAdmin } = useAuth();
  if (isImpersonating && originalAdmin?.role === 'admin') {
    return <>{children}</>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function App() {
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
        <Route path="/setup/:id" element={<SetupDetail />} />
      </Routes>
    </>
  );
}

export default App;
