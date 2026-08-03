import React from 'react';
import { useParams, Link } from 'react-router-dom';
import './SetupDetail.css';
import { useSetups } from '../hooks/useSetups';
import { useSetupHistory } from '../hooks/useHawkeye';
import { SetupCard } from '../components/SetupCard';

export const SetupDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { setups, loading: setupsLoading } = useSetups();
  
  const setup = setups.find(s => s.id === id);
  const market = (setup?.market || 'futures') as any;
  
  const { history, loading: historyLoading } = useSetupHistory(id || '', market);

  if (setupsLoading) {
    return <div className="setup-detail-loading">Loading setup...</div>;
  }

  if (!setup) {
    return (
      <div className="setup-detail-error container">
        <Link to="/" className="back-link">← Back to Dashboard</Link>
        <h2>Setup not found</h2>
        <p>The requested setup could not be found or has been purged.</p>
      </div>
    );
  }

  const isResolved = (setup.signal_state || setup.state || '').toLowerCase() === 'resolved';

  return (
    <div className="setup-detail-page">
      <header className="sd-header glass-card">
        <div className="container header-container">
          <Link to="/" className="back-link">← Back to Dashboard</Link>
          <h1 className="sd-title">Setup Details: {setup.instrument}</h1>
        </div>
      </header>

      <main className="container sd-main">
        <div className="sd-grid">
          <div className="sd-primary">
            <SetupCard setup={setup} />
            
            {isResolved && (
              <div className="outcome-section glass-card animate-slide-up">
                <h3>Trade Outcome</h3>
                <div className="outcome-stats">
                  <div className="stat-box">
                    <span className="stat-label">Final P/L</span>
                    <span className="stat-val text-green">+2.4R</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">MAE</span>
                    <span className="stat-val text-red">-0.4R</span>
                  </div>
                </div>
                <div className="execution-details">
                  <span className="exec-label">Execution:</span>
                  <p>Target hit during London session.</p>
                </div>
              </div>
            )}
          </div>

          <div className="sd-sidebar">
            <div className="history-card glass-card">
              <h3>📜 Manna Live Trade Log</h3>
              
              {historyLoading ? (
                <div className="history-loading">Loading history...</div>
              ) : history.length === 0 ? (
                <div className="history-empty">No invalidation records for this setup.</div>
              ) : (
                <div className="timeline">
                  {history.map((record: any) => (
                    <div key={record.id} className="timeline-item">
                      <div className="timeline-dot"></div>
                      <div className="timeline-content">
                        <div className="tl-time">{new Date(record.timestamp || record.created_at || '').toLocaleTimeString()} ET</div>
                        <div className="tl-state">
                          {record.oldState || record.previous_state || 'awaiting_entry'} → <span className="text-red">{record.newState || record.new_state || 'invalidated'}</span>
                        </div>
                        <div className="tl-reason">{record.reasonCode || record.reason_code}</div>
                        <div className="tl-detail">{record.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
