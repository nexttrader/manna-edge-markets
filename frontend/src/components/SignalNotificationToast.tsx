import React from 'react';
import { useSignalNotifications } from '../context/SignalNotificationContext';
import './SignalNotificationToast.css';

export const SignalNotificationToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useSignalNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container-global font-sans">
      {toasts.map(toast => {
        const isLong = toast.bias === 'LONG';
        const isProfit = toast.type === 'tp_hit' || toast.type === 'breakeven';
        const isLoss = toast.type === 'sl_hit';

        return (
          <div key={toast.id} className={`toast-card-item toast-${toast.type} animate-slide-in`}>
            <div className="toast-card-header">
              <div className="toast-header-left font-mono">
                <span className="toast-icon">{toast.icon}</span>
                <span className="toast-title">{toast.title}</span>
              </div>
              <button className="toast-close-btn font-mono" onClick={() => dismissToast(toast.id)}>
                ✕
              </button>
            </div>

            <div className="toast-card-body">
              <div className="toast-asset-row font-mono">
                <span className="toast-symbol">{toast.instrument}</span>
                <span className={`toast-bias-chip ${isLong ? 'long' : 'short'}`}>
                  {isLong ? '⬆ LONG' : '⬇ SHORT'}
                </span>
                <span className="toast-market-chip">({toast.market})</span>
              </div>

              <p className="toast-detail-text">{toast.detail}</p>

              {toast.levels && (
                <div className="toast-levels-grid font-mono">
                  {toast.levels.entry && <div><span>Entry:</span> <strong>{toast.levels.entry}</strong></div>}
                  {toast.levels.stop && <div><span>SL:</span> <strong className="text-red">{toast.levels.stop}</strong></div>}
                  {toast.levels.tp1 && <div><span>TP1:</span> <strong className="text-green">{toast.levels.tp1}</strong></div>}
                </div>
              )}

              {toast.rMultiple !== undefined && (
                <div className={`toast-r-badge font-mono ${isProfit ? 'profit' : isLoss ? 'loss' : ''}`}>
                  {toast.rMultiple > 0 ? `+${toast.rMultiple.toFixed(2)}R REALIZED` : `${toast.rMultiple.toFixed(2)}R REALIZED`}
                </div>
              )}
            </div>

            <div className="toast-progress-bar" />
          </div>
        );
      })}
    </div>
  );
};
