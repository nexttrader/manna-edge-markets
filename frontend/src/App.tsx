import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';
import { AdminPanel } from './pages/AdminPanel';
import { SuperAdminPanel } from './pages/SuperAdminPanel';
import { SetupDetail } from './pages/SetupDetail';
import { useAuth } from './context/AuthContext';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import { MasterPasscodeModal } from './components/MasterPasscodeModal';
import { FirstLoginPasswordModal } from './components/FirstLoginPasswordModal';
import { TrialExpiredModal } from './components/TrialExpiredModal';
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
  const navigate = useNavigate();

  if (isImpersonating && originalAdmin?.role === 'super_admin') {
    return <>{children}</>;
  }

  if (user && user.role === 'super_admin') {
    return <>{children}</>;
  }

  return (
    <MasterPasscodeModal
      onSuccess={() => {}}
      onCancel={() => navigate('/dashboard')}
    />
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { elevateToSuperAdmin } = useAuth();
  const [showSecretModal, setShowSecretModal] = useState(false);

  useEffect(() => {
    telemetryTracker.trackPageView(location.pathname);
  }, [location.pathname]);

  // Global Secret Type-In Sequence: Typing "5287" anywhere on any page
  useEffect(() => {
    let typedBuffer = '';
    let resetTimer: any;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore typing inside input/textarea fields
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Check Ctrl+Shift+K hotkey
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSecretModal(true);
        return;
      }

      // Buffer typed digits/letters
      if (/^[0-9a-zA-Z]$/.test(e.key)) {
        typedBuffer += e.key;
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { typedBuffer = ''; }, 3000);

        if (typedBuffer.endsWith('5287') || typedBuffer.toLowerCase().endsWith('manna')) {
          elevateToSuperAdmin();
          typedBuffer = '';
          navigate('/vault-5287');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(resetTimer);
    };
  }, [elevateToSuperAdmin, navigate]);

  return (
    <>
      <ImpersonationBanner />
      <FirstLoginPasswordModal />
      <TrialExpiredModal />
      {showSecretModal && (
        <MasterPasscodeModal
          onSuccess={() => setShowSecretModal(false)}
          onCancel={() => setShowSecretModal(false)}
        />
      )}
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
        {/* Secret Master Telemetry Desk */}
        <Route 
          path="/vault-5287" 
          element={
            <ProtectedSuperAdminRoute>
              <SuperAdminPanel />
            </ProtectedSuperAdminRoute>
          } 
        />
        <Route path="/super-admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/vault-7729" element={<Navigate to="/dashboard" replace />} />
        <Route path="/setup/:id" element={<SetupDetail />} />
      </Routes>
    </>
  );
}

export default App;
