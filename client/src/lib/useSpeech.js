import { useCallback, useEffect, useRef, useState } from 'react';

const LOCALES = { en: 'en-IN', hi: 'hi-IN' };

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const locale = LOCALES[lang] ?? lang;
  return (
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(lang)) ??
    // Indian English reads Indian crop and chemical names better than other English voices.
    (lang === 'en' ? voices.find((v) => v.lang?.startsWith('en')) : null)
  );
}

/**
 * Reads advice aloud with the browser's built-in Web Speech API: no server, no cost, works offline
 * where the device has voices installed. `parts` is a list of { text, lang } segments so a Hindi
 * summary can be followed by English advisory text in an English voice.
 */
export function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!supported) return undefined;
    // Voices load asynchronously in Chrome; touching the list starts the load.
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.cancel();
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    cancelled.current = true;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (parts) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      cancelled.current = false;
      const segments = parts.filter((p) => p.text?.trim());
      if (!segments.length) return;
      setSpeaking(true);
      segments.forEach((part, i) => {
        const utterance = new SpeechSynthesisUtterance(part.text);
        utterance.lang = LOCALES[part.lang] ?? part.lang;
        const voice = pickVoice(part.lang);
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        if (i === segments.length - 1) {
          utterance.onend = () => !cancelled.current && setSpeaking(false);
          utterance.onerror = () => setSpeaking(false);
        }
        window.speechSynthesis.speak(utterance);
      });
    },
    [supported],
  );

  const hasVoiceFor = useCallback((lang) => supported && Boolean(pickVoice(lang)), [supported]);

  return { supported, speaking, speak, stop, hasVoiceFor };
}
