/**
 * Selects best voice accent and rate for regional Indian farmer speech synthesis.
 */
export function getVoiceConfigForLocale(locale) {
  switch (locale) {
    case 'hi':
      return { lang: 'hi-IN', rate: 0.9, pitch: 1.0 };
    case 'ta':
      return { lang: 'ta-IN', rate: 0.85, pitch: 1.0 };
    case 'te':
      return { lang: 'te-IN', rate: 0.85, pitch: 1.0 };
    default:
      return { lang: 'en-IN', rate: 0.95, pitch: 1.0 };
  }
}
