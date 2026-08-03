import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { EdgeSetup } from '../types';
import { useVoice } from './VoiceContext';
import { API_BASE } from '../config';
import { translateRationaleToPlainEnglish, translateInvalidationToPlainEnglish } from '../utils/plainLanguage';

export interface SignalToastItem {
  id: string;
  type: 'new_signal' | 'entry_filled' | 'breakeven' | 'tp_hit' | 'sl_hit' | 'invalidated' | 'resolved';
  title: string;
  icon: string;
  instrument: string;
  market: string;
  bias: string;
  detail: string;
  plainEnglish?: string;
  levels?: {
    entry?: string;
    stop?: number;
    tp1?: number;
    tp2?: number;
  };
  rMultiple?: number;
  createdAt: number;
}

export interface LiveActivityItem {
  id: string;
  type: 'new_signal' | 'entry_filled' | 'breakeven' | 'tp_hit' | 'sl_hit' | 'invalidated' | 'resolved';
  title: string;
  icon: string;
  instrument: string;
  market: string;
  bias: string;
  detail: string;
  plainEnglish: string;
  timestamp: string;
  rMultiple?: number;
}

interface SignalNotificationContextType {
  toasts: SignalToastItem[];
  activityLogs: LiveActivityItem[];
  dismissToast: (id: string) => void;
  clearActivityLogs: () => void;
  showActivityFeed: boolean;
  setShowActivityFeed: (show: boolean) => void;
}

const SignalNotificationContext = createContext<SignalNotificationContextType | undefined>(undefined);

export const SignalNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<SignalToastItem[]>([]);
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const [activityLogs, setActivityLogs] = useState<LiveActivityItem[]>(() => {
    try {
      const saved = localStorage.getItem('manna_live_activity_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const { speak } = useVoice();

  const prevSetupsRef = useRef<Map<string, EdgeSetup>>(new Map());
  const isInitialLoad = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearActivityLogs = useCallback(() => {
    setActivityLogs([]);
    try { localStorage.removeItem('manna_live_activity_logs'); } catch {}
  }, []);

  const addActivityLog = useCallback((item: Omit<LiveActivityItem, 'id' | 'timestamp'>) => {
    const newItem: LiveActivityItem = {
      ...item,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ET'
    };

    setActivityLogs(prev => {
      const updated = [newItem, ...prev.slice(0, 49)];
      try { localStorage.setItem('manna_live_activity_logs', JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const addToast = useCallback((toast: Omit<SignalToastItem, 'id' | 'createdAt'>, plainEnglish: string) => {
    const newToast: SignalToastItem = {
      ...toast,
      plainEnglish,
      id: `toast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: Date.now()
    };

    setToasts(prev => [newToast, ...prev.slice(0, 3)]); // Keep max 4 visible toasts

    // Add to persistent Live Activity Feed
    addActivityLog({
      type: toast.type,
      title: toast.title,
      icon: toast.icon,
      instrument: toast.instrument,
      market: toast.market,
      bias: toast.bias,
      detail: toast.detail,
      plainEnglish,
      rMultiple: toast.rMultiple
    });

    // Auto fade out after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  }, [addActivityLog]);

  const fetchSetups = useCallback(async () => {
    try {
      // Fetch both active AND recent past setups so exit/invalidation/replacement events are detected reliably!
      const [activeRes, pastRes] = await Promise.all([
        fetch(`${API_BASE}/api/accelerate/active-setups`),
        fetch(`${API_BASE}/api/accelerate/past-setups?limit=20`)
      ]);

      if (!activeRes.ok) return;

      const activeData = await activeRes.json();
      const pastData = pastRes.ok ? await pastRes.json() : { setups: [] };

      const activeList: EdgeSetup[] = activeData.setups || [];
      const pastList: EdgeSetup[] = pastData.setups || [];

      // Combine active + recent past setups
      const combinedList: EdgeSetup[] = [...activeList];
      pastList.forEach(p => {
        if (!combinedList.some(a => a.id === p.id)) {
          combinedList.push(p);
        }
      });

      const newMap = new Map<string, EdgeSetup>();
      combinedList.forEach(s => newMap.set(s.id, s));

      if (!isInitialLoad.current) {
        for (const setup of combinedList) {
          const prev = prevSetupsRef.current.get(setup.id);
          const biasText = (setup.bias || 'LONG').toUpperCase();
          const marketText = (setup.market || 'futures').toUpperCase();
          const entryMid = setup.entry_zone_mid || setup.entry_zone_low || 0;

          if (!prev) {
            // Only fire NEW SIGNAL if setup is actually in awaiting_entry state
            const stateStr = setup.signal_state || setup.state || '';
            if (stateStr === 'awaiting_entry') {
              const plainEng = translateRationaleToPlainEnglish(setup.metadata ? (typeof setup.metadata === 'string' ? JSON.parse(setup.metadata)?.selection_rationale : (setup.metadata as any)?.selection_rationale) : undefined, biasText, setup.instrument);
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
              }, plainEng);
            }
          } else {
            const prevState = prev.signal_state || prev.state;
            const currState = setup.signal_state || setup.state;

            // 2. ENTRY FILLED
            if (prevState === 'awaiting_entry' && currState === 'active') {
              const plainEng = `Order filled at ${entryMid}! Market price touched our buy zone, so your position is now live.`;
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
              }, plainEng);
            }

            // 3. MOVE TO BREAKEVEN (+1.0R reached or backend flag)
            const prevR = prev.unrealizedR ?? 0;
            const currR = setup.unrealizedR ?? 0;
            const isBE = (setup as any).is_breakeven || currR >= 1.0;
            const prevBE = (prev as any).is_breakeven || prevR >= 1.0;

            if (isBE && !prevBE && (currState === 'active' || currState === 'resolved')) {
              const plainEng = `Trade reached +1.0R profit! Your stop loss moved to entry price. You now have $0 risk on this trade.`;
              speak(`Move Stop Loss to Break Even for ${setup.instrument}. Position is now Risk Free.`);
              addToast({
                type: 'breakeven',
                title: 'MOVE STOP LOSS TO BREAK EVEN',
                icon: '🛡️',
                instrument: setup.instrument,
                market: marketText,
                bias: biasText,
                detail: `Unrealized profit reached +${currR.toFixed(2)}R! Stop loss moved to Entry (Risk Free).`,
                rMultiple: currR
              }, plainEng);
            }

            // 4. RESOLVED OUTCOMES (Exits & Target Hits)
            if (prevState !== 'resolved' && currState === 'resolved') {
              const outcomeReason = String(setup.invalidation_reason || (setup as any).outcome_type || (setup as any).outcome || '').toLowerCase();
              
              if (outcomeReason.includes('tp2')) {
                const plainEng = `Target 2 hit at ${setup.tp2}! Full profit locked in (+3.0R).`;
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
                }, plainEng);
              } else if (outcomeReason.includes('tp1') || outcomeReason.includes('tp')) {
                const plainEng = `Target 1 hit at ${setup.tp1}! First profit target secured (+2.0R).`;
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
                }, plainEng);
              } else if (outcomeReason.includes('be_hit') || outcomeReason.includes('breakeven') || outcomeReason.includes('be')) {
                const plainEng = `Price turned back after reaching profit and touched entry price. Closed with zero loss ($0.00).`;
                speak(`Break Even Stop Hit for ${setup.instrument}. Trade closed at zero loss.`);
                addToast({
                  type: 'breakeven',
                  title: 'BREAK EVEN HIT (ZERO LOSS)',
                  icon: '🛡️',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Closed at zero loss (0.0R) after moving to Break Even.`,
                  rMultiple: 0.0
                }, plainEng);
              } else if (outcomeReason.includes('sl') || outcomeReason.includes('stop')) {
                const plainEng = `Price touched stop loss level ${setup.stop}. Trade closed cleanly to protect your balance.`;
                speak(`Stop Loss Hit for ${setup.instrument} in Loss.`);
                addToast({
                  type: 'sl_hit',
                  title: 'STOP LOSS HIT',
                  icon: '🛑',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Price touched Stop Loss level ${setup.stop}. Trade closed (-1.0R).`,
                  rMultiple: -1.0
                }, plainEng);
              } else {
                const plainEng = `Trade for ${setup.instrument} has finished and closed.`;
                speak(`Trade Closed for ${setup.instrument}.`);
                addToast({
                  type: 'resolved',
                  title: 'TRADE RESOLVED',
                  icon: '🏁',
                  instrument: setup.instrument,
                  market: marketText,
                  bias: biasText,
                  detail: `Position resolved.`
                }, plainEng);
              }
            }

            // 5. INVALIDATIONS & REPLACEMENTS
            if (prevState !== 'invalidated' && currState === 'invalidated') {
              const reason = setup.invalidation_reason || '';
              const plainEng = translateInvalidationToPlainEnglish(reason);
              speak(`Signal Cancelled for ${setup.instrument}.`);
              addToast({
                type: 'invalidated',
                title: 'SIGNAL CANCELLED',
                icon: '🏃',
                instrument: setup.instrument,
                market: marketText,
                bias: biasText,
                detail: translateInvalidationToPlainEnglish(reason)
              }, plainEng);
            }

            // 6. SIGNAL REPLACED BY ADMIN
            const reasonStr = setup.invalidation_reason || '';
            if (prevState === 'awaiting_entry' && (currState === 'superseded' || reasonStr.includes('replaced'))) {
              const plainEng = `Admin or scanner found a higher-conviction setup for ${setup.instrument}, so the old signal was updated!`;
              speak(`Attention: Pending signal for ${setup.instrument} has been updated and replaced by Admin.`);
              addToast({
                type: 'invalidated',
                title: 'SIGNAL REPLACED BY ADMIN',
                icon: '⚡',
                instrument: setup.instrument,
                market: marketText,
                bias: biasText,
                detail: `The pending signal for ${setup.instrument} was replaced with a new setup candidate.`
              }, plainEng);
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
    <SignalNotificationContext.Provider value={{
      toasts,
      activityLogs,
      dismissToast,
      clearActivityLogs,
      showActivityFeed,
      setShowActivityFeed
    }}>
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

