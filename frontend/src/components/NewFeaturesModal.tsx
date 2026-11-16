import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './NewFeaturesModal.css';

const MAX_AUTO_VIEWS = 3;
const STORAGE_PREFIX = 'manna_new_features_views_v2_';
const SESSION_PREFIX = 'manna_new_features_session_v2_';
export const OPEN_NEW_FEATURES_EVENT = 'manna:open-new-features';

interface FeatureItem {
  num: string;
  tag: string;
  accent: 'gold' | 'emerald' | 'amber' | 'blue' | 'purple';
  title: string;
  description: string;
}

const FEATURE_SCRIPT: FeatureItem[] = [
  {
    num: '01',
    tag: 'EDGEFINDER',
    accent: 'gold',
    title: 'Find the Strongest Markets First — Skip the Noise',
    description:
      'Instead of guessing across 20 different charts, EdgeFinder scores and ranks markets from strongest to weakest in real time. You can immediately see which pairs are moving cleanly and skip the choppy ones.'
  },
  {
    num: '02',
    tag: 'SCALPING DESK · 15M / 5M',
    accent: 'emerald',
    title: 'Built for Fast, Short-Term Moves',
    description:
      'If you like quick in-and-out trades during busy market hours, switch to the green Scalping tab. It keeps fast 15-minute and 5-minute setups separated so you never mix up your timeframes.'
  },
  {
    num: '03',
    tag: 'INTRADAY DESK · 1H / 15M',
    accent: 'amber',
    title: 'Your Core Day-Trade Engine — Untouched',
    description:
      'Your regular 1-hour and 15-minute intraday setups work just like before. Every trade card still shows your entry zone, stop loss, and profit targets in plain sight for Asia, London, and New York sessions.'
  },
  {
    num: '04',
    tag: 'SWING DESK · D1 / 4H',
    accent: 'blue',
    title: 'Bigger-Picture Setups for Multi-Day Traders',
    description:
      'Can’t watch screens all day? Open the blue Swing tab for slower, higher-timeframe trade ideas designed for traders who prefer holding positions over several days.'
  },
  {
    num: '05',
    tag: 'LIGHT & DARK MODE + CLEANER VIEW',
    accent: 'purple',
    title: 'Trade Comfortably Day or Night',
    description:
      'Switch between bright Light Mode and Dark Mode in one click from the top bar. Signal filters also start tucked away so you see your active trade setups the second you log in.'
  }
];

export const NewFeaturesModal: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [viewCount, setViewCount] = useState<number>(0);
  const [openedManually, setOpenedManually] = useState(false);

  const isAuthAppRoute =
    Boolean(user) &&
    location.pathname !== '/' &&
    location.pathname !== '/login' &&
    location.pathname !== '/signup' &&
    location.pathname !== '/trial';

  // Auto-open on the user's next 3 login sessions
  useEffect(() => {
    if (!isAuthAppRoute || !user) return;
    const userKey = String(user.id || user.email || 'default');
    const storageKey = `${STORAGE_PREFIX}${userKey}`;
    const sessionKey = `${SESSION_PREFIX}${userKey}`;

    const alreadyShownThisSession = window.sessionStorage.getItem(sessionKey) === '1';
    const currentViews = parseInt(window.localStorage.getItem(storageKey) || '0', 10) || 0;

    if (!alreadyShownThisSession && currentViews < MAX_AUTO_VIEWS) {
      const nextViews = currentViews + 1;
      window.localStorage.setItem(storageKey, String(nextViews));
      window.sessionStorage.setItem(sessionKey, '1');
      setViewCount(nextViews);
      setOpenedManually(false);
      setIsOpen(true);
    }
  }, [isAuthAppRoute, user]);

  // Allow flashing "New Features" button to open the modal anytime
  useEffect(() => {
    const handleOpen = () => {
      setOpenedManually(true);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_NEW_FEATURES_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_NEW_FEATURES_EVENT, handleOpen);
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleDismissForever = () => {
    if (user) {
      const userKey = String(user.id || user.email || 'default');
      window.localStorage.setItem(`${STORAGE_PREFIX}${userKey}`, String(MAX_AUTO_VIEWS));
      window.sessionStorage.setItem(`${SESSION_PREFIX}${userKey}`, '1');
    }
    setIsOpen(false);
  };

  return (
    <div className="nf-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="nf-modal-title">
      <div className="nf-modal-card">
        <div className="nf-modal-header">
          <div className="nf-header-badges font-mono">
            <span className="nf-pill-live">★ WHAT&apos;S NEW IN MANNA EDGE</span>
            {!openedManually && viewCount > 0 && (
              <span className="nf-pill-count">
                LOGIN NOTICE {viewCount} OF {MAX_AUTO_VIEWS}
              </span>
            )}
          </div>
          <button
            type="button"
            className="nf-close-x"
            onClick={handleClose}
            aria-label="Close new features popup"
          >
            ✕
          </button>
        </div>

        <h2 id="nf-modal-title" className="nf-modal-title">
          Simpler, Faster Tools to Help You Spot Better Trade Ideas
        </h2>
        <p className="nf-modal-intro">
          We upgraded Manna Edge so you spend less time hunting through charts and more time reviewing clear setups built for your trading style. Here is what&apos;s new in plain English:
        </p>

        <div className="nf-feature-list">
          {FEATURE_SCRIPT.map((item) => (
            <div key={item.num} className={`nf-feature-item accent-${item.accent}`}>
              <div className="nf-feature-num font-mono">{item.num}</div>
              <div className="nf-feature-body">
                <span className="nf-feature-tag font-mono">{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="nf-compliance-box">
          <strong>Important Risk &amp; Compliance Note:</strong> Trading futures and forex involves substantial risk of loss and is not suitable for every investor. EdgeFinder rankings and trade setups are market research and educational tools only—they are not financial advice and do not guarantee future profits. Always size your trades responsibly.
        </div>

        <div className="nf-modal-footer">
          {!openedManually && viewCount < MAX_AUTO_VIEWS && (
            <button type="button" className="nf-btn-secondary font-mono" onClick={handleDismissForever}>
              Don&apos;t Show Automatically Again
            </button>
          )}
          <button type="button" className="nf-btn-primary font-mono" onClick={handleClose}>
            Got It — Take Me to My Desk →
          </button>
        </div>
      </div>
    </div>
  );
};
