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

  // Pre-load system voices on mount (macOS loads them async)
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      console.log('[Manna Voice] Voices loaded:', voices.length);

      // Prefer high-quality English voices on macOS
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
   * Core speak function.
   * IMPORTANT: No cancel() before speak() — Chrome fires cancel async which kills the new utterance.
   */
  const doSpeak = useCallback((message: string) => {
    if (!('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (selectedVoiceRef.current) {
      utterance.voice = selectedVoiceRef.current;
    }

    utterance.onstart = () => console.log('[Manna Voice] ✅ Speaking:', message);
    utterance.onend = () => {
      console.log('[Manna Voice] ✅ Finished');
      (window as any).__mannaUtterance = null;
    };
    utterance.onerror = (e) => {
      console.error('[Manna Voice] ❌ Error:', e.error);
      (window as any).__mannaUtterance = null;
    };

    // Prevent GC from killing the utterance mid-speech
    (window as any).__mannaUtterance = utterance;

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((message: string, force: boolean = false) => {
    if (!voiceEnabled && !force) return;
    console.log('[Manna Voice] speak() →', message);
    doSpeak(message);
  }, [voiceEnabled, doSpeak]);

  const testVoice = useCallback(() => {
    console.log('[Manna Voice] Test button clicked');
    setVoiceEnabled(true);
    doSpeak('Manna Edge Markets Voice System online. Signal alerts active.');
  }, [doSpeak]);

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
