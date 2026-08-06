import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface VoiceSettings {
  voiceEnabled: boolean;
  selectedVoiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  chimeEnabled: boolean;
}

interface VoiceContextType extends VoiceSettings {
  availableVoices: SpeechSynthesisVoice[];
  toggleVoice: () => void;
  setSelectedVoiceURI: (uri: string) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  setChimeEnabled: (enabled: boolean) => void;
  speak: (message: string, force?: boolean) => void;
  testVoice: (customText?: string) => void;
  cleanTradingTextForSpeech: (text: string) => string;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

// Web Audio API pre-alert chime (synthesizes a high-tech dual-tone chime without external audio files)
const playAlertChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    // First tone (A5 - 880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second tone (D6 - 1174.66Hz) with slight delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1174.66, now + 0.06);
    gain2.gain.setValueAtTime(0.12, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.4);
  } catch {
    // Ignore audio context errors
  }
};

// Trading ticker & jargon phonetic sanitizer
const cleanTradingTextForSpeech = (text: string): string => {
  if (!text) return '';
  let cleaned = text;

  const replacements: Array<[RegExp, string]> = [
    // Instrument / Forex Pair Replacements
    [/\bEURUSD\b/gi, 'Euro Dollar'],
    [/\bGBPUSD\b/gi, 'Pound Dollar'],
    [/\bUSDJPY\b/gi, 'Dollar Yen'],
    [/\bAUDUSD\b/gi, 'Aussie Dollar'],
    [/\bUSDCAD\b/gi, 'Dollar Cad'],
    [/\bUSDCHF\b/gi, 'Dollar Swiss'],
    [/\bNZDUSD\b/gi, 'Kiwi Dollar'],
    [/\bEURGBP\b/gi, 'Euro Pound'],
    [/\bEURJPY\b/gi, 'Euro Yen'],
    [/\bGBPJPY\b/gi, 'Pound Yen'],
    [/\bXAUUSD\b|\bGOLD\b/gi, 'Gold'],
    [/\bXAGUSD\b|\bSILVER\b/gi, 'Silver'],
    [/\bNAS100\b|\bNQ1!\b|\bNQ\b/gi, 'Nasdaq'],
    [/\bUS30\b|\bYM1!\b|\bYM\b/gi, 'Dow Jones'],
    [/\bSPX500\b|\bES1!\b|\bES\b/gi, 'S and P 500'],
    [/\bBTCUSD\b/gi, 'Bitcoin'],
    [/\bETHUSD\b/gi, 'Ethereum'],

    // Technical Jargon & Abbreviation Replacements
    [/\bTP1\b/gi, 'Take Profit 1'],
    [/\bTP2\b/gi, 'Take Profit 2'],
    [/\bTP3\b/gi, 'Take Profit 3'],
    [/\bBE\b/gi, 'Break Even'],
    [/\bSL\b/gi, 'Stop Loss'],
    [/\bSMC\b/gi, 'Smart Money Concept'],
    [/\bICT\b/gi, 'I C T'],
    [/\bRSI\b/gi, 'R S I'],
    [/\b2R\b/gi, '2 R'],
    [/\b3R\b/gi, '3 R'],
    [/\b1h\b/gi, '1 hour'],
    [/\b4h\b/gi, '4 hour'],
    [/\b15m\b/gi, '15 minute'],
    [/\b5m\b/gi, '5 minute'],
    [/\b1m\b/gi, '1 minute'],
    [/\bBULLISH\b/gi, 'Bullish'],
    [/\bBEARISH\b/gi, 'Bearish'],
  ];

  for (const [regex, replacement] of replacements) {
    cleaned = cleaned.replace(regex, replacement);
  }

  return cleaned;
};

// Automatic ranking to select the highest-quality natural neural voice available
const getBestDefaultVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const searchPool = englishVoices.length > 0 ? englishVoices : voices;

  const priorityPatterns = [
    /google us english/i,
    /google uk english female/i,
    /google uk english male/i,
    /microsoft.*online.*natural/i,
    /microsoft.*natural/i,
    /samantha.*enhanced/i,
    /karen.*enhanced/i,
    /daniel.*enhanced/i,
    /samantha/i,
    /karen/i,
    /daniel/i,
    /alex/i,
    /victoria/i,
    /moira/i,
    /serena/i
  ];

  for (const pattern of priorityPatterns) {
    const match = searchPool.find(v => pattern.test(v.name));
    if (match) return match;
  }

  // Network / neural voices typically have localService === false
  const networkVoice = searchPool.find(v => !v.localService);
  if (networkVoice) return networkVoice;

  return searchPool[0] || voices[0];
};

export const VoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('manna_voice_alerts');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState<string>(() => {
    return localStorage.getItem('manna_voice_uri') || '';
  });
  const [rate, setRateState] = useState<number>(() => {
    const saved = localStorage.getItem('manna_voice_rate');
    return saved ? parseFloat(saved) : 0.95; // 0.95 rate offers crisp articulate trading delivery
  });
  const [pitch, setPitchState] = useState<number>(() => {
    const saved = localStorage.getItem('manna_voice_pitch');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = localStorage.getItem('manna_voice_volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [chimeEnabled, setChimeEnabledState] = useState<boolean>(() => {
    const saved = localStorage.getItem('manna_voice_chime');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const recentSpokenRef = useRef<Map<string, number>>(new Map());

  // Load and monitor system speech synthesis voices
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);

        // Auto-select best voice if none selected or if previously selected voice is no longer available
        setSelectedVoiceURIState(prev => {
          if (prev && voices.some(v => v.voiceURI === prev)) {
            return prev;
          }
          const best = getBestDefaultVoice(voices);
          const newUri = best ? best.voiceURI : '';
          if (newUri) localStorage.setItem('manna_voice_uri', newUri);
          return newUri;
        });
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem('manna_voice_alerts', JSON.stringify(voiceEnabled));
  }, [voiceEnabled]);

  const toggleVoice = () => setVoiceEnabled(prev => !prev);

  const setSelectedVoiceURI = (uri: string) => {
    setSelectedVoiceURIState(uri);
    localStorage.setItem('manna_voice_uri', uri);
  };

  const setRate = (r: number) => {
    setRateState(r);
    localStorage.setItem('manna_voice_rate', r.toString());
  };

  const setPitch = (p: number) => {
    setPitchState(p);
    localStorage.setItem('manna_voice_pitch', p.toString());
  };

  const setVolume = (v: number) => {
    setVolumeState(v);
    localStorage.setItem('manna_voice_volume', v.toString());
  };

  const setChimeEnabled = (c: boolean) => {
    setChimeEnabledState(c);
    localStorage.setItem('manna_voice_chime', JSON.stringify(c));
  };

  // High quality voice synthesis execution
  const speak = useCallback((message: string, force: boolean = false) => {
    if (!('speechSynthesis' in window)) return;
    if (!voiceEnabled && !force) return;

    // Deduplicate exact messages spoken within 4 seconds
    const now = Date.now();
    const lastSpokenTime = recentSpokenRef.current.get(message) || 0;
    if (now - lastSpokenTime < 4000) return;

    recentSpokenRef.current.set(message, now);
    if (recentSpokenRef.current.size > 50) recentSpokenRef.current.clear();

    // Play pre-alert audio chime if enabled
    if (chimeEnabled) {
      playAlertChime();
    }

    // Clean text for speech
    const formattedMessage = cleanTradingTextForSpeech(message);

    const utterance = new SpeechSynthesisUtterance(formattedMessage);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    // Apply user chosen voice or best default
    if (availableVoices.length > 0) {
      const chosenVoice = availableVoices.find(v => v.voiceURI === selectedVoiceURI) || getBestDefaultVoice(availableVoices);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      }
    }

    utterance.onstart = () => console.log('[Manna Voice] 📢 Speaking:', formattedMessage);
    utterance.onerror = (e) => console.error('[Manna Voice] ❌ Error:', e.error);

    // Keep reference in window to prevent Chrome garbage-collection speech cutoff bug
    (window as any).__mannaUtterance = utterance;

    try {
      // Un-stick queue if paused or pending before speaking new alert
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('[Manna Voice] Exception calling speak():', e);
    }
  }, [voiceEnabled, selectedVoiceURI, availableVoices, rate, pitch, volume, chimeEnabled]);

  const testVoice = useCallback((customText?: string) => {
    console.log('[Manna Voice] ▶ Test voice button clicked');

    if ('speechSynthesis' in window) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }

    setVoiceEnabled(true);
    const sampleText = customText || 'Manna Edge Markets voice system online. Take Profit 1 reached for EURUSD. High precision audio alerts active.';
    speak(sampleText, true);
  }, [speak]);

  return (
    <VoiceContext.Provider
      value={{
        voiceEnabled,
        selectedVoiceURI,
        rate,
        pitch,
        volume,
        chimeEnabled,
        availableVoices,
        toggleVoice,
        setSelectedVoiceURI,
        setRate,
        setPitch,
        setVolume,
        setChimeEnabled,
        speak,
        testVoice,
        cleanTradingTextForSpeech
      }}
    >
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
