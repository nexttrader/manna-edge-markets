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

  const recentSpokenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    localStorage.setItem('manna_voice_alerts', JSON.stringify(voiceEnabled));
  }, [voiceEnabled]);

  const toggleVoice = () => setVoiceEnabled(prev => !prev);

  // Native speech call, relying entirely on the browser's internal speech queue.
  const speak = useCallback((message: string, force: boolean = false) => {
    if (!('speechSynthesis' in window)) return;
    if (!voiceEnabled && !force) return;

    // Deduplicate exact messages spoken within 4 seconds
    const now = Date.now();
    const lastSpokenTime = recentSpokenRef.current.get(message) || 0;
    if (now - lastSpokenTime < 4000) return;

    recentSpokenRef.current.set(message, now);
    if (recentSpokenRef.current.size > 50) recentSpokenRef.current.clear();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => console.log('[Manna Voice] 📢 Speaking:', message);
    utterance.onerror = (e) => console.error('[Manna Voice] ❌ Error:', e.error);
    
    // Hold reference to avoid garbage collection mid-speech (Chrome bug)
    (window as any).__mannaUtterance = utterance;

    try {
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('[Manna Voice] Exception calling speak():', e);
    }
  }, [voiceEnabled]);

  const testVoice = useCallback(() => {
    console.log('[Manna Voice] ▶ Test voice button clicked');
    
    if ('speechSynthesis' in window) {
       // Only cancel if it is actively doing something to un-stick it. 
       // Calling cancel when idle breaks it in some Safari versions.
       if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
         window.speechSynthesis.cancel();
       }
       if (window.speechSynthesis.paused) {
         window.speechSynthesis.resume();
       }
    }

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
