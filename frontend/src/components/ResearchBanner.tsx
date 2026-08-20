import React, { useState } from 'react';
import './ResearchBanner.css';

export const ResearchBanner: React.FC = () => {
  // Dismiss per session (sessionStorage so it reappears on next login/tab)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return sessionStorage.getItem('manna_research_banner_dismissed') === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try { sessionStorage.setItem('manna_research_banner_dismissed', '1'); } catch {}
    setDismissed(true);
  };

  return (
    <div className="research-banner font-mono animate-fade-in">
      <div className="research-banner-icon">🔬</div>
      <div className="research-banner-body">
        <span className="research-banner-title">Research Project — We Need Your Help!</span>
        <span className="research-banner-text">
          We're working on improving signal accuracy and results. If you plan to paper trade or demo a signal,
          tap the <strong>🏷️ Tag</strong> button at the bottom of its card. Your picks help us measure real-world
          client accuracy vs our decision matrix.
        </span>
      </div>
      <button className="research-banner-close" onClick={handleDismiss} title="Dismiss">✕</button>
    </div>
  );
};
