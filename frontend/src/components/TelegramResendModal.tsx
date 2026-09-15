import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../config';
import { formatTelegramTradeId, cleanSymbol } from '../utils/tradeId';

interface TelegramResendModalProps {
  setup: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newSetupId?: string) => void;
}

export const TelegramResendModal: React.FC<TelegramResendModalProps> = ({
  setup,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [assignNewTradeId, setAssignNewTradeId] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !setup) return null;

  const currentTradeId = formatTelegramTradeId(setup);
  const sym = cleanSymbol(setup.instrument || '');
  const biasRaw = (setup.bias || 'long').toLowerCase();
  const isLong = biasRaw === 'long';
  const market = (setup.market || (setup.instrument?.includes('/') ? 'forex' : 'futures')).toLowerCase();

  const handleResend = async () => {
    try {
      setSending(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch(`${API_BASE}/api/super-admin/signals/${setup.id}/resend-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market,
          assignNewTradeId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to resend signal to Telegram');
      }

      setSuccessMsg(data.message || 'Signal successfully resent to Telegram!');
      
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(data.setupId);
        }
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch Telegram message');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="font-mono"
        style={{
          background: '#131722',
          border: '1px solid rgba(41, 182, 246, 0.4)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(41, 182, 246, 0.2)',
          color: '#eceff1',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            background: 'linear-gradient(135deg, rgba(41, 182, 246, 0.15) 0%, rgba(3, 169, 244, 0.05) 100%)',
            borderBottom: '1px solid rgba(41, 182, 246, 0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>📲</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#29b6f6', letterSpacing: '0.02em' }}>
                RESEND SIGNAL TO TELEGRAM
              </h3>
              <span style={{ fontSize: '0.72rem', color: '#90a4ae' }}>
                Super Admin Direct Dispatch Console
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#90a4ae',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px' }}>
          {/* Signal Overview Card */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '1.1rem', color: '#ffffff' }}>{setup.instrument}</strong>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: 'rgba(41, 182, 246, 0.15)',
                    color: '#29b6f6',
                    fontWeight: 700
                  }}
                >
                  {market.toUpperCase()}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  background: isLong ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                  color: isLong ? '#00e676' : '#ff1744'
                }}
              >
                {isLong ? '⬆ LONG' : '⬇ SHORT'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: '#b0bec5' }}>
              <div>
                <span style={{ color: '#78909c' }}>Entry Zone: </span>
                <span style={{ color: '#fff' }}>{setup.entry_zone_low ?? setup.entryMin} – {setup.entry_zone_high ?? setup.entryMax}</span>
              </div>
              <div>
                <span style={{ color: '#78909c' }}>Stop Loss: </span>
                <span style={{ color: '#ff5252' }}>{setup.stop ?? setup.levels?.stopLoss}</span>
              </div>
              <div>
                <span style={{ color: '#78909c' }}>TP1 (+2R): </span>
                <span style={{ color: '#00e676' }}>{setup.tp1 ?? setup.levels?.takeProfit1}</span>
              </div>
              <div>
                <span style={{ color: '#78909c' }}>TP2: </span>
                <span style={{ color: '#ffb74d' }}>{setup.tp2 ?? setup.levels?.takeProfit2 ?? 'Open Runner'}</span>
              </div>
            </div>
          </div>

          {/* Current Trade ID vs New Trade ID Box */}
          <div
            style={{
              background: 'rgba(41, 182, 246, 0.05)',
              border: '1px solid rgba(41, 182, 246, 0.25)',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: '#90a4ae' }}>Current Broadcast Trade ID:</span>
              <code style={{ fontSize: '0.85rem', color: '#ffb74d', fontWeight: 800 }}>{currentTradeId}</code>
            </div>

            {/* Toggle Switch */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: assignNewTradeId ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                border: assignNewTradeId ? '1px solid #00e676' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setAssignNewTradeId(!assignNewTradeId)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>🔄</span>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: assignNewTradeId ? '#00e676' : '#eceff1' }}>
                    Assign New Trade ID
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#90a4ae' }}>
                    {assignNewTradeId ? 'Fresh unique trade ID suffix will be generated' : 'Retain existing trade ID for re-notification'}
                  </div>
                </div>
              </div>

              {/* Custom Switch Visual */}
              <div
                style={{
                  width: '42px',
                  height: '22px',
                  borderRadius: '12px',
                  background: assignNewTradeId ? '#00e676' : '#37474f',
                  position: 'relative',
                  transition: 'background 0.2s ease'
                }}
              >
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: assignNewTradeId ? '22px' : '2px',
                    transition: 'left 0.2s ease'
                  }}
                />
              </div>
            </div>

            {/* Preview of Trade ID to be sent */}
            <div style={{ marginTop: '10px', fontSize: '0.74rem', color: '#b0bec5', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Target Telegram Trade ID:</span>
              {assignNewTradeId ? (
                <span style={{ color: '#00e676', fontWeight: 800 }}>
                  #{sym}-[NEW UUID] (Generated on Send)
                </span>
              ) : (
                <span style={{ color: '#ffb74d', fontWeight: 800 }}>
                  {currentTradeId} (Original ID)
                </span>
              )}
            </div>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div
              style={{
                background: 'rgba(255, 23, 68, 0.15)',
                border: '1px solid #ff1744',
                color: '#ff5252',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                marginBottom: '16px'
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(0, 230, 118, 0.15)',
                border: '1px solid #00e676',
                color: '#00e676',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>✓</span> {successMsg}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              style={{
                background: 'transparent',
                border: '1px solid #546e7a',
                color: '#b0bec5',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={sending}
              style={{
                background: sending
                  ? '#37474f'
                  : 'linear-gradient(135deg, #0288d1 0%, #0091ea 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: '6px',
                cursor: sending ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: sending ? 'none' : '0 2px 12px rgba(2, 136, 209, 0.4)'
              }}
            >
              {sending ? (
                <>⏳ Dispatching...</>
              ) : (
                <>📲 Confirm &amp; Dispatch to Telegram</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
