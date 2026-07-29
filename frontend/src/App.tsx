import { Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { Dashboard } from './pages/Dashboard';
import { ClientDashboard } from './pages/ClientDashboard';
import { LoginPage } from './pages/LoginPage';
import { AdminPanel } from './pages/AdminPanel';
import { SetupDetail } from './pages/SetupDetail';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/client" element={<ClientDashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/setup/:id" element={<SetupDetail />} />
    </Routes>
  );
}

export default App;
