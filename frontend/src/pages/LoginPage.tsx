import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'trader' | 'admin'>('trader');
  const [tier, setTier] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError(null);
    login(email, role, name || (role === 'admin' ? 'System Administrator' : 'Institutional Trader'), tier);
    navigate(role === 'admin' ? '/admin' : '/dashboard');
  };

  const handleDemoLogin = (demoRole: 'trader' | 'admin') => {
    const demoEmail = demoRole === 'admin' ? 'admin@mannaedge.com' : 'trader@mannaedge.com';
    const demoName = demoRole === 'admin' ? 'System Administrator' : 'Institutional Trader';
    login(demoEmail, demoRole, demoName, 'futures_forex');
    navigate(demoRole === 'admin' ? '/admin' : '/dashboard');
  };

  return (
    <div className="login-page-container">
      <div className="login-backdrop-glow" />

      <div className="login-card glass-card animate-scale-up">
        {/* Logo Header */}
        <div className="login-header">
          <Link to="/" className="login-logo-link">
            <div className="login-logo-emblem">⚡</div>
            <h1 className="login-logo-text font-mono">MANNA EDGE MARKETS</h1>
          </Link>
          <p className="login-subtitle">Institutional Killzone Discovery Engine & Multi-Timeframe Trading Desk</p>
        </div>

        {/* Auth Mode Tabs */}
        <div className="auth-tabs font-mono">
          <button 
            className={!isRegister ? 'active' : ''} 
            onClick={() => { setIsRegister(false); setError(null); }}
          >
            🔑 Sign In
          </button>
          <button 
            className={isRegister ? 'active' : ''} 
            onClick={() => { setIsRegister(true); setError(null); }}
          >
            ✨ Register Account
          </button>
        </div>

        {/* Quick Demo Login Bar */}
        <div className="demo-login-box">
          <span className="demo-label font-mono">⚡ 1-CLICK DEMO LOGINS:</span>
          <div className="demo-btns">
            <button className="btn-demo trader font-mono" onClick={() => handleDemoLogin('trader')}>
              👨‍💻 Trader Demo
            </button>
            <button className="btn-demo admin font-mono" onClick={() => handleDemoLogin('admin')}>
              ⚙️ Admin Demo
            </button>
          </div>
        </div>

        {error && <div className="login-error-msg">{error}</div>}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="login-form">
          {isRegister && (
            <div className="form-group">
              <label className="font-mono">Full Name</label>
              <input 
                type="text" 
                placeholder="e.g. Chadwin Solomon" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="font-mono"
              />
            </div>
          )}

          <div className="form-group">
            <label className="font-mono">Institutional Email</label>
            <input 
              type="email" 
              placeholder="trader@mannaedge.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="font-mono"
              required
            />
          </div>

          <div className="form-group">
            <label className="font-mono">Password</label>
            <input 
              type="password" 
              placeholder="••••••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="font-mono"
              required
            />
          </div>

          <div className="form-group">
            <label className="font-mono">Account Access Level</label>
            <select 
              value={role} 
              onChange={e => setRole(e.target.value as any)}
              className="font-mono"
            >
              <option value="trader">Institutional Trader (Dashboard & Trading Desk)</option>
              <option value="admin">System Administrator (Telemetry & Controls)</option>
            </select>
          </div>

          {role === 'trader' && (
            <div className="form-group">
              <label className="font-mono">Subscription Access Tier</label>
              <select 
                value={tier} 
                onChange={e => setTier(e.target.value as any)}
                className="font-mono"
              >
                <option value="free">🆓 Free Tier (Max 2 Futures + 2 Forex setups/session)</option>
                <option value="forex_only">⚡ Forex Only Tier (All Forex pairs & Manna SnD)</option>
                <option value="futures_forex">🏛️ Futures & Forex Tier (All Access - Futures & Forex)</option>
              </select>
            </div>
          )}

          <button type="submit" className="btn-submit font-mono">
            {isRegister ? '✨ CREATE ACCOUNT & LAUNCH' : '🚀 SIGN IN TO TRADING DESK'}
          </button>
        </form>

        <div className="login-footer">
          <Link to="/" className="back-link font-mono">← Back to Public Home</Link>
          <span className="copyright font-mono">© 2026 MANNA EDGE MARKETS</span>
        </div>
      </div>
    </div>
  );
};
