import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface VoiceContextType {
  voiceEnabled: boolean;
  toggleVoice: () => void;
  speak: (message: string, force?: boolean) => void;
  testVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// High-clarity 0.4s 2-tone bell chime WAV base64
const CHIME_WAV_BASE64 = 'data:audio/wav;base64,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';

function playChimeOnly() {
  try {
    const audio = new Audio(CHIME_WAV_BASE64);
    audio.volume = 0.8;
    audio.play().catch(() => {});
  } catch {}
}

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);

  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const recentSpokenRef = useRef<Map<string, number>>(new Map());
  const watchdogTimerRef = useRef<any>(null);
  const isUnlockedRef = useRef<boolean>(false);

  // Global Audio Unlocker on First User Interaction
  useEffect(() => {
    const unlockAudio = () => {
      if (isUnlockedRef.current) return;
      isUnlockedRef.current = true;
      console.log('[Manna Voice] 🔓 Unlocking browser audio & speech synthesis...');

      try {
        playChimeOnly();
        if ('speechSynthesis' in window) {
          window.speechSynthesis.resume();
          const dummy = new SpeechSynthesisUtterance(' ');
          dummy.volume = 0.01;
          window.speechSynthesis.speak(dummy);
        }
      } catch {}

      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const toggleVoice = () => {
    setVoiceEnabled(prev => {
      const next = !prev;
      if (next) playChimeOnly();
      return next;
    });
  };

  /**
   * Process speech queue sequentially with a 400ms pause after chime
   */
  const processQueue = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeakingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();
    if (!nextMessage) return;

    isSpeakingRef.current = true;

    // 1. Play alert chime first
    playChimeOnly();

    // 2. Wait 400ms for chime audio to finish so Chrome speech compositor isn't blocked
    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel(); // Clear any stale Chrome speech queue
      } catch {}

      const utterance = new SpeechSynthesisUtterance(nextMessage);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const finishCurrent = () => {
        if (watchdogTimerRef.current) {
          clearTimeout(watchdogTimerRef.current);
          watchdogTimerRef.current = null;
        }
        (window as any).__mannaUtterance = null;
        isSpeakingRef.current = false;
        setTimeout(() => processQueue(), 300);
      };

      utterance.onstart = () => console.log('[Manna Voice] 📢 Speaking phrase:', nextMessage);
      utterance.onend = () => {
        console.log('[Manna Voice] ✅ Finished phrase:', nextMessage);
        finishCurrent();
      };
      utterance.onerror = (e) => {
        console.error('[Manna Voice] ❌ Speech error:', e.error);
        finishCurrent();
      };

      watchdogTimerRef.current = setTimeout(() => {
        console.warn('[Manna Voice] ⚠️ Watchdog timeout, resetting queue');
        try { window.speechSynthesis.cancel(); } catch {}
        finishCurrent();
      }, 7000);

      (window as any).__mannaUtterance = utterance;

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error('[Manna Voice] Exception calling speak():', err);
        finishCurrent();
      }
    }, 400);
  }, []);

  const speak = useCallback((message: string, force: boolean = false) => {
    if (!voiceEnabled && !force) return;

    const now = Date.now();
    const lastSpokenTime = recentSpokenRef.current.get(message) || 0;
    if (now - lastSpokenTime < 4000) return;

    recentSpokenRef.current.set(message, now);
    if (recentSpokenRef.current.size > 50) recentSpokenRef.current.clear();

    queueRef.current.push(message);
    processQueue();
  }, [voiceEnabled, processQueue]);

  const testVoice = useCallback(() => {
    console.log('[Manna Voice] ▶ Test button clicked');
    isUnlockedRef.current = true;

    setVoiceEnabled(true);
    speak('Manna Edge Markets voice system active. Signal alert speech online.', true);
  }, [speak]);

  return (
    <VoiceContext.Provider value={{ voiceEnabled, toggleVoice, speak, testVoice }}>
      {children}
    </VoiceContext.Provider>
  );
};

export const useVoice = () => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
};
