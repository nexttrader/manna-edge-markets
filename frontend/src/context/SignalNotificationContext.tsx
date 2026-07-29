import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { EdgeSetup } from '../types';
import { useVoice } from './VoiceContext';
import { API_BASE } from '../config';

export interface SignalToastItem {
  id: string;
  type: 'new_signal' | 'entry_filled' | 'breakeven' | 'tp_hit' | 'sl_hit' | 'invalidated';
  title: string;
  icon: string;
  instrument: string;
  market: string;
  bias: string;
  detail: string;
  levels?: {
    entry?: string;
    stop?: number;
    tp1?: number;
    tp2?: number;
  };
  rMultiple?: number;
  createdAt: number;
}

interface SignalNotificationContextType {
  toasts: SignalToastItem[];
  dismissToast: (id: string) => void;
}

const SignalNotificationContext = createContext<SignalNotificationContextType | undefined>(undefined);

export const SignalNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<SignalToastItem[]>([]);
  const { speak } = useVoice();

  const prevSetupsRef = useRef<Map<string, EdgeSetup>>(new Map());
  const isInitialLoad = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<SignalToastItem, 'id' | 'createdAt'>) => {
    const newToast: SignalToastItem = {
      ...toast,
      id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: Date.now()
    };

    setToasts(prev => [newToast, ...prev.slice(0, 3)]); // Keep max 4 visible toasts

    // Auto fade out after 4.5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 4500);
  }, []);

  const fetchSetups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/accelerate/active-setups`);
      if (!res.ok) return;
      const data = await res.json();
      const currentList: EdgeSetup[] = data.setups || [];

      const newMap = new Map<string, EdgeSetup>();
      currentList.forEach(s => newMap.set(s.id, s));

      if (!isInitialLoad.current) {
        for (const setup of currentList) {
          const prev = prevSetupsRef.current.get(setup.id);
          const biasText = (setup.bias || 'LONG').toUpperCase();
          const marketText = (setup.market || 'futures').toUpperCase();
          const entryMid = setup.entry_zone_mid || setup.entry_zone_low || 0;

          if (!prev) {
            // 1. NEW SIGNAL DISCOVERED
            speak(`New Signal Discovered. ${biasText} ${setup.instrument}.`);
            addToast({
              type: 'new_signal',
              title: 'NEW SIGNAL DISCOVERED',
              icon: '📡',
              instrument: setup.instrument,
              market: marketText,
              bias: biasText,
              detail: `${biasText} Entry Zone: ${setup.entry_zone_low} - ${setup.entry_zone_high} | Target TP1: ${setup.tp1}`,
              levels: {
                entry: `${setup.entry_zone_low} - ${setup.entry_zone_high}`,
                stop: setup.stop,
                tp1: setup.tp1,
                tp2: setup.tp2
              }
            });
          } else {
            const prevState = prev.signal_state || prev.state;
            const currState = setup.signal_state || setup.state;

            // 2. ENTRY FILLED
            if (prevState === 'awaiting_entry' && currState === 'active') {
              speak(`Entry Triggered for ${setup.instrument}. Position Filled.`);
              addToast({
                type: 'entry_filled',
                title: 'ENTRY TRIGGERED (POSITION FILLED)',
                icon: '⚡',
                instrument: setup.instrument,
                market: marketText,
                bias: biasText,
                detail: `Position filled at ${(setup as any).entry_price_recorded || entryMid}. Trade is now ACTIVE!`,
                levels: {
                  stop: setup.stop,
                  tp1: setup.tp1
                }
              });
            }

            // 3. MOVE TO BREAKEVEN (+1.0R reached or backend flag)
            const prevR = prev.unrealizedR ?? 0;
            const currR = setup.unrealizedR ?? 0;
            const isBE = (setup as any).is_breakeven || currR >= 1.0;
            const prevBE = (prev as any).is_breakeven || prevR >= 1.0;

            if (isBE && !prevBE && (currState === 'active' || currState === 'resolved')) {
              speak(`Move Stop Loss to Break Even for ${setup.instrument}. Position is now Risk Free.`);
              addToast({
                type: 'breakeven',
                title: 'MOVE STOP LOSS TO BREAK EVEN',
                icon: '🛡️',
                instrument: setup.instrument,
                market: marketText,
                bias: biasText,
                detail: `Unrealized profit reached +${currR.toFixed(2)}R! Move Stop Loss to Entry to lock in a risk-free position.`,
                rMultiple: currR
              });
            }

            // 4. RESOLVED OUTCOMES (Exits & Target Hits)
            if (prevState !== 'resolved' && currState === 'resolved') {
              const outcomeReason = String(setup.invalidation_reason || (setup as any).outcome_type || (setup as any).outcome || '').toLowerCase();
              
              if (outcomeReason.includes('tp2')) {
                speak(`Take Profit 2 Reached for ${setup.instrument} in Full Profit.`);
                addToast({
                  type: 'tp_hit',
                  title: 'TAKE PROFIT 2 HIT (FULL PROFIT)',
                  icon: '🎯',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Target 2 reached at ${setup.tp2}! Realized profit +${setup.r_multiple_2 || 3.0}R!`,
                  rMultiple: setup.r_multiple_2 || 3.0
                });
              } else if (outcomeReason.includes('tp1') || outcomeReason.includes('tp')) {
                speak(`Take Profit 1 Reached for ${setup.instrument} in Profit.`);
                addToast({
                  type: 'tp_hit',
                  title: 'TAKE PROFIT 1 HIT (PROFIT)',
                  icon: '🟢',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Target 1 reached at ${setup.tp1}! Realized profit +${setup.r_multiple_1 || 2.0}R.`,
                  rMultiple: setup.r_multiple_1 || 2.0
                });
              } else if (outcomeReason.includes('be_hit') || outcomeReason.includes('breakeven') || outcomeReason.includes('be')) {
                speak(`Break Even Stop Hit for ${setup.instrument}. Trade closed at zero loss.`);
                addToast({
                  type: 'breakeven',
                  title: 'BREAK EVEN HIT (ZERO LOSS)',
                  icon: '🛡️',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Price returned to entry after moving to Break Even. Closed at zero loss (0.0R).`,
                  rMultiple: 0.0
                });
              } else if (outcomeReason.includes('sl') || outcomeReason.includes('stop')) {
                speak(`Stop Loss Hit for ${setup.instrument} in Loss.`);
                addToast({
                  type: 'sl_hit',
                  title: 'STOP LOSS HIT',
                  icon: '🛑',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Price touched Stop Loss level ${setup.stop}. Trade closed in loss (-1.0R).`,
                  rMultiple: -1.0
                });
              } else {
                speak(`Trade Closed for ${setup.instrument}.`);
                addToast({
                  type: 'resolved',
                  title: 'TRADE RESOLVED',
                  icon: '🏁',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Position resolved.`
                });
              }
            }

            // 5. INVALIDATIONS
            if (prevState !== 'invalidated' && currState === 'invalidated') {
              const reason = setup.invalidation_reason || '';
              if (reason.includes('displaced')) {
                speak(`Signal Cancelled for ${setup.instrument} due to Price Displacement.`);
                addToast({
                  type: 'invalidated',
                  title: 'SIGNAL CANCELLED (DISPLACED)',
                  icon: '🏃',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Price moved away from entry zone without filling. Order cancelled to prevent chasing.`
                });
              }
            }
          }
        }
      } else {
        isInitialLoad.current = false;
      }

      prevSetupsRef.current = newMap;
    } catch {}
  }, [speak, addToast]);

  useEffect(() => {
    fetchSetups();
    const interval = setInterval(fetchSetups, 5000);
    return () => clearInterval(interval);
  }, [fetchSetups]);

  return (
    <SignalNotificationContext.Provider value={{ toasts, dismissToast }}>
      {children}
    </SignalNotificationContext.Provider>
  );
};

export const useSignalNotifications = () => {
  const context = useContext(SignalNotificationContext);
  if (!context) {
    throw new Error('useSignalNotifications must be used within a SignalNotificationProvider');
  }
  return context;
};
