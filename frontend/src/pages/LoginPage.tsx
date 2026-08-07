import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Auth Flow Steps: 'email' | 'create_password' | 'enter_password' | 'register'
  const [step, setStep] = useState<'email' | 'create_password' | 'enter_password' | 'register'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'trader' | 'admin' | 'super_admin'>('trader');
  const [tier, setTier] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  
  const [userInfo, setUserInfo] = useState<{ name: string; isTrial?: boolean; trialDaysRemaining?: number; trialExpiresAt?: string; customFeatures?: any; role?: string; tier?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Check Email
  const handleCheckEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/admin/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail })
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify email');
      }

      if (data.status === 'preloaded_first_login') {
        setUserInfo({
          name: data.name,
          isTrial: data.isTrial,
          trialDaysRemaining: data.trialDaysRemaining,
          role: data.role,
          tier: data.tier
        });
        setRole(data.role || 'trader');
        setTier(data.tier || 'futures_forex');
        setStep('create_password');
      } else if (data.status === 'existing_member') {
        setUserInfo({
          name: data.name,
          role: data.role,
          tier: data.tier,
          isTrial: data.isTrial,
          trialDaysRemaining: data.trialDaysRemaining,
          trialExpiresAt: data.trialExpiresAt,
          customFeatures: data.customFeatures
        });
        setRole(data.role || 'trader');
        setTier(data.tier || 'futures_forex');
        setStep('enter_password');
      } else {
        setStep('register');
      }
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Error checking email address');
    }
  };

  // Step 2A: Create First Password for Preloaded Member
  const handleSetupFirstPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      setError('Please enter a password with at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/admin/auth/setup-first-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save password');
      }

      const activeUser = data.user;
      login(
        activeUser.email, 
        activeUser.role, 
        activeUser.name, 
        activeUser.tier, 
        activeUser.mustChangePassword,
        activeUser.isTrial,
        activeUser.trialDaysRemaining,
        activeUser.trialExpired,
        activeUser.trialExpiresAt,
        activeUser.customFeatures
      );
      navigate(activeUser.role === 'admin' || activeUser.role === 'super_admin' ? '/admin' : '/dashboard');
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Failed to save password');
    }
  };

  // Step 2B: Sign In Existing Member
  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError(null);
    login(
      email.trim(), 
      role, 
      userInfo?.name || 'Institutional Trader', 
      tier, 
      false, 
      userInfo?.isTrial, 
      userInfo?.trialDaysRemaining, 
      false,
      userInfo?.trialExpiresAt,
      userInfo?.customFeatures
    );
    navigate(role === 'admin' || role === 'super_admin' ? '/admin' : '/dashboard');
  };

  // Step 2C: Register New Member (Self-Signup: Free Tier - 14-Day Trial Pass ONLY)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) {
      setError('Please fill in your name and password.');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/admin/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password
        })
      });

      const data = await res.json();
      setLoading(false);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      const registeredUser = data.user;
      login(registeredUser.email, 'trader', registeredUser.name, 'free', false, true, 14, false);
      navigate('/dashboard');
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleResetStep = () => {
    setStep('email');
    setPassword('');
    setConfirmPassword('');
    setError(null);
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

        {error && <div className="login-error-msg">{error}</div>}

        {/* STEP 1: ENTER EMAIL */}
        {step === 'email' && (
          <form onSubmit={handleCheckEmail} className="login-form">
            <div className="form-group">
              <label className="font-mono">Enter Your Institutional Email</label>
              <input 
                type="email" 
                placeholder="name@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="font-mono"
                autoFocus
                required
              />
            </div>

            <button type="submit" className="btn-submit font-mono" disabled={loading}>
              {loading ? 'Checking Member Status...' : 'Continue ➔'}
            </button>
          </form>
        )}

        {/* STEP 2A: FIRST TIME PRELOADED LOG-IN (CREATE PASSWORD) */}
        {step === 'create_password' && (
          <form onSubmit={handleSetupFirstPassword} className="login-form">
            <div className="welcome-banner glass-card font-mono">
              <div className="welcome-icon">
                {userInfo?.role === 'admin' || userInfo?.role === 'super_admin' ? '🛡️' : userInfo?.isTrial ? '🎟️' : '⚡'}
              </div>
              <div>
                <h4>Welcome, {userInfo?.name}!</h4>
                <p>
                  {userInfo?.role === 'admin' || userInfo?.role === 'super_admin' ? (
                    <>Set up your private password below to activate your <strong>Administrative Access</strong>.</>
                  ) : userInfo?.isTrial ? (
                    <>Welcome back! As part of our recent system upgrade, we kindly ask that you reset your password. Once set, your <strong>{userInfo?.trialDaysRemaining || 21}-Day VIP Trial Access</strong> will activate. We apologize for the inconvenience!</>
                  ) : (
                    <>Welcome back! As part of our recent system upgrade, we kindly ask that you reset your password to restore your <strong>Full Membership Access</strong>. We apologize for this one-time inconvenience—once set, you'll be able to log in normally moving forward.</>
                  )}
                </p>
              </div>
            </div>

            <div className="form-group">
              <label className="font-mono">Account Email</label>
              <input type="text" value={email} disabled className="font-mono disabled-input" />
            </div>

            <div className="form-group">
              <label className="font-mono">Create New Password</label>
              <input 
                type="password" 
                placeholder="••••••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="font-mono"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="font-mono">Confirm New Password</label>
              <input 
                type="password" 
                placeholder="••••••••••••" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)}
                className="font-mono"
                required
              />
            </div>

            <button type="submit" className="btn-submit font-mono" disabled={loading}>
              {loading ? 'Activating Account...' : '✨ Activate VIP Access & Launch'}
            </button>

            <button type="button" onClick={handleResetStep} className="btn-back-step font-mono">
              ← Change Email
            </button>
          </form>
        )}

        {/* STEP 2B: EXISTING MEMBER SIGN IN */}
        {step === 'enter_password' && (
          <form onSubmit={handleSignIn} className="login-form">
            <div className="welcome-banner glass-card font-mono">
              <div className="welcome-icon">👋</div>
              <div>
                <h4>Welcome Back, {userInfo?.name}!</h4>
                <p>Enter your password to sign in to your Trading Desk.</p>
              </div>
            </div>

            <div className="form-group">
              <label className="font-mono">Email</label>
              <input type="text" value={email} disabled className="font-mono disabled-input" />
            </div>

            <div className="form-group">
              <label className="font-mono">Password</label>
              <input 
                type="password" 
                placeholder="••••••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)}
                className="font-mono"
                autoFocus
                required
              />
            </div>

            <button type="submit" className="btn-submit font-mono">
              🚀 Sign In to Trading Desk
            </button>

            <button type="button" onClick={handleResetStep} className="btn-back-step font-mono">
              ← Change Email
            </button>
          </form>
        )}

        {/* STEP 2C: NEW MEMBER REGISTRATION */}
        {step === 'register' && (
          <form onSubmit={handleRegister} className="login-form">
            <div className="welcome-banner glass-card font-mono">
              <div className="welcome-icon">✨</div>
              <div>
                <h4>Create Your Account</h4>
                <p>Set up your new Manna Edge Markets trader profile.</p>
              </div>
            </div>

            <div className="form-group">
              <label className="font-mono">Email</label>
              <input type="text" value={email} disabled className="font-mono disabled-input" />
            </div>

            <div className="form-group">
              <label className="font-mono">Full Name</label>
              <input 
                type="text" 
                placeholder="e.g. Alex Morgan" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="font-mono"
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="font-mono">Create Password</label>
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
              <label className="font-mono">Subscription Tier</label>
              <input 
                type="text" 
                value="🆓 Free Tier (14-Day VIP Trial Pass)" 
                disabled 
                className="font-mono disabled-input" 
                style={{ color: '#38bdf8', fontWeight: 700 }}
              />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                Includes 14 days of signal access. Upgrade to paid tiers anytime from your dashboard or via admin coupon.
              </span>
            </div>

            <button type="submit" className="btn-submit font-mono" disabled={loading}>
              {loading ? 'Activating Account...' : '✨ Activate 14-Day Trial & Launch'}
            </button>

            <button type="button" onClick={handleResetStep} className="btn-back-step font-mono">
              ← Change Email
            </button>
          </form>
        )}

        <div className="login-footer">
          <Link to="/" className="back-link font-mono">← Back to Public Home</Link>
          <span className="copyright font-mono">© 2026 MANNA EDGE MARKETS</span>
        </div>
      </div>
    </div>
  );
};
