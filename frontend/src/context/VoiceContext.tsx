import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

interface VoiceContextType {
  voiceEnabled: boolean;
  toggleVoice: () => void;
  speak: (message: string, force?: boolean) => void;
  testVoice: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

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

  // Pre-load system voices on mount
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

  const toggleVoice = () => setVoiceEnabled(prev => !prev);

  /**
   * Process queue sequentially so messages never overlap or lock up Chrome
   */
  const processQueue = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeakingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();
    if (!nextMessage) return;

    isSpeakingRef.current = true;

    // Safety check: clear any residual stuck state in Chrome before starting new utterance
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

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
      // Wait 300ms pause between sequential announcements
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

    // Watchdog timer: If Chrome fails to trigger onend/onerror within 8 seconds, force finish
    watchdogTimerRef.current = setTimeout(() => {
      console.warn('[Manna Voice] ⚠️ Watchdog timeout triggered, unlocking queue.');
      finishCurrent();
    }, 8000);

    // Prevent GC from collecting utterance mid-speech
    (window as any).__mannaUtterance = utterance;

    window.speechSynthesis.speak(utterance);
  }, []);

  /**
   * Public speak call — deduplicates & adds to sequential queue
   */
  const speak = useCallback((message: string, force: boolean = false) => {
    if (!voiceEnabled && !force) return;

    const now = Date.now();
    const lastSpokenTime = recentSpokenRef.current.get(message) || 0;

    // Ignore exact duplicate messages spoken within the last 4 seconds
    if (now - lastSpokenTime < 4000) {
      console.log('[Manna Voice] Suppressed duplicate announcement:', message);
      return;
    }

    recentSpokenRef.current.set(message, now);

    // Clean old entries from deduplication map periodically
    if (recentSpokenRef.current.size > 50) {
      recentSpokenRef.current.clear();
    }

    console.log('[Manna Voice] Queued:', message);
    queueRef.current.push(message);
    processQueue();
  }, [voiceEnabled, processQueue]);

  const testVoice = useCallback(() => {
    console.log('[Manna Voice] Test voice triggered');
    setVoiceEnabled(true);
    speak('Manna Edge Markets Voice System online. Signal alerts active.', true);
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
