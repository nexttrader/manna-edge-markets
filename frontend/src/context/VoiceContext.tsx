import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface VoiceContextType {
  voiceEnabled: boolean;
  toggleVoice: () => void;
  speak: (message: string, force?: boolean) => void;
  testVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// Web Audio API Synthesized Chime (Fallback & Signal Alert Tone)
function playSignalChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Arpeggio chime 523Hz (C5) -> 659Hz (E5) -> 784Hz (G5)
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(784.00, now + 0.16);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (err) {
    console.warn('[Manna Audio] Chime error:', err);
  }
}

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('manna_voice_alerts');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const recentSpokenRef = useRef<Map<string, number>>(new Map());
  const watchdogTimerRef = useRef<any>(null);
  const isUnlockedRef = useRef<boolean>(false);

  // Global Audio & Speech Synthesis Unlocker on User Interaction
  useEffect(() => {
    const unlockAudio = () => {
      if (isUnlockedRef.current) return;
      isUnlockedRef.current = true;

      console.log('[Manna Voice] 🔓 User gesture detected — unlocking audio engine');

      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
          // Speak a silent empty string to prime the browser's speech synthesizer
          const dummy = new SpeechSynthesisUtterance('');
          dummy.volume = 0;
          window.speechSynthesis.speak(dummy);
        } catch {}
      }

      // Remove global listeners once unlocked
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

  // Pre-load system voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      console.log('[Manna Voice] Voices loaded:', voices.length);

      const preferred = [
        'Samantha', 'Alex', 'Daniel', 'Karen', 'Moira', 'Tessa',
        'Google US English', 'Google UK English Male',
        'Microsoft David', 'Microsoft Zira'
      ];

      let voice: SpeechSynthesisVoice | undefined;
      for (const name of preferred) {
        voice = voices.find(v => v.name.includes(name));
        if (voice) break;
      }
      if (!voice) voice = voices.find(v => v.lang.startsWith('en'));
      if (!voice) voice = voices.find(v => v.default) || voices[0];

      selectedVoiceRef.current = voice || null;
      console.log('[Manna Voice] Selected voice:', voice?.name, voice?.lang);
    };

    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    setTimeout(pickVoice, 250);
    setTimeout(pickVoice, 1000);
  }, []);

  useEffect(() => {
    localStorage.setItem('manna_voice_alerts', JSON.stringify(voiceEnabled));
  }, [voiceEnabled]);

  const toggleVoice = () => {
    setVoiceEnabled(prev => {
      const next = !prev;
      if (next) {
        playSignalChime();
      }
      return next;
    });
  };

  /**
   * Process speech queue sequentially
   */
  const processQueue = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeakingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();
    if (!nextMessage) return;

    isSpeakingRef.current = true;

    // Reset speech engine state before new utterance
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    // Always play alert chime at the start of an announcement
    playSignalChime();

    const utterance = new SpeechSynthesisUtterance(nextMessage);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (selectedVoiceRef.current) {
      utterance.voice = selectedVoiceRef.current;
    }

    const finishCurrent = () => {
      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      (window as any).__mannaUtterance = null;
      isSpeakingRef.current = false;
      setTimeout(() => processQueue(), 300);
    };

    utterance.onstart = () => {
      console.log('[Manna Voice] 📢 Speaking:', nextMessage);
    };

    utterance.onend = () => {
      console.log('[Manna Voice] ✅ Finished:', nextMessage);
      finishCurrent();
    };

    utterance.onerror = (e) => {
      console.error('[Manna Voice] ❌ Error speaking:', nextMessage, e.error);
      finishCurrent();
    };

    // Watchdog timer (7 sec limit per sentence)
    watchdogTimerRef.current = setTimeout(() => {
      console.warn('[Manna Voice] ⚠️ Watchdog timeout, forcing queue unlock.');
      try {
        window.speechSynthesis.cancel();
      } catch {}
      finishCurrent();
    }, 7000);

    // Keep utterance reference in memory to avoid Chrome GC bug
    (window as any).__mannaUtterance = utterance;

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[Manna Voice] speak() exception:', err);
      finishCurrent();
    }
  }, []);

  /**
   * Public speak call — deduplicates & adds to queue
   */
  const speak = useCallback((message: string, force: boolean = false) => {
    if (!voiceEnabled && !force) return;

    const now = Date.now();
    const lastSpokenTime = recentSpokenRef.current.get(message) || 0;

    // Suppress exact duplicates spoken within 4 seconds
    if (now - lastSpokenTime < 4000) {
      console.log('[Manna Voice] Suppressed duplicate announcement:', message);
      return;
    }

    recentSpokenRef.current.set(message, now);
    if (recentSpokenRef.current.size > 50) {
      recentSpokenRef.current.clear();
    }

    console.log('[Manna Voice] Queued:', message);
    queueRef.current.push(message);
    processQueue();
  }, [voiceEnabled, processQueue]);

  const testVoice = useCallback(() => {
    console.log('[Manna Voice] Test voice button clicked');
    isUnlockedRef.current = true;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel(); // Clear any stale Chrome speech queue
    } catch {}

    playSignalChime();
    setVoiceEnabled(true);

    setTimeout(() => {
      speak('Manna Edge Markets audio system online. Signal voice alerts active.', true);
    }, 150);
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
