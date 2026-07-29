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

  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const recentSpokenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    localStorage.setItem('manna_voice_alerts', JSON.stringify(voiceEnabled));
  }, [voiceEnabled]);

  const toggleVoice = () => setVoiceEnabled(prev => !prev);

  /**
   * Pure Speech Synthesis Queue (No chimes, no Web Audio API)
   */
  const processQueue = useCallback(() => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeakingRef.current) return;
    if (queueRef.current.length === 0) return;

    const nextMessage = queueRef.current.shift();
    if (!nextMessage) return;

    isSpeakingRef.current = true;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    const utterance = new SpeechSynthesisUtterance(nextMessage);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const finishCurrent = () => {
      isSpeakingRef.current = false;
      setTimeout(() => processQueue(), 250);
    };

    utterance.onstart = () => {
      console.log('[Manna Voice] 📢 Speaking:', nextMessage);
    };

    utterance.onend = () => {
      console.log('[Manna Voice] ✅ Completed:', nextMessage);
      finishCurrent();
    };

    utterance.onerror = (err) => {
      console.error('[Manna Voice] ❌ Error:', err);
      finishCurrent();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('[Manna Voice] Exception calling speak():', err);
      finishCurrent();
    }
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
    console.log('[Manna Voice] ▶ Test voice button clicked');
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.cancel();
    } catch {}

    setVoiceEnabled(true);
    speak('Manna Edge Markets voice system online. Signal voice alerts active.', true);
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
