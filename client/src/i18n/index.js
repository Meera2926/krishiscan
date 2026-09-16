import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.js';
import hi from './hi.js';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
];

const STORAGE_KEY = 'ks_lang';

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Non-essential.
  }
});
document.documentElement.lang = i18n.language;

/** Picks a localised name from a { hi: '...' } map, falling back to the English name. */
export function localName(entity, lang) {
  if (!entity) return '';
  return (lang !== 'en' && entity.names?.[lang]) || entity.commonName || entity.name || '';
}

export default i18n;
