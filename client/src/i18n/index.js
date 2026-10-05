import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.js';
import hi from './hi.js';
import ml from './ml.js';
import ta from './ta.js';
import te from './te.js';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'ml', label: 'മലയാളം' },
];

/** Every language the UI is translated into, for the resource map and the browser sniff. */
const BUNDLES = { en, hi, ta, te, ml };

const STORAGE_KEY = 'ks_lang';

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the browser language.
  }
  // Match the browser's language against the ones we actually have, not just Hindi.
  const browser = navigator.language?.toLowerCase() ?? '';
  return LANGUAGES.find((l) => l.code !== 'en' && browser.startsWith(l.code))?.code ?? 'en';
}

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(BUNDLES).map(([code, translation]) => [code, { translation }])),
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

/** Picks a localised name from a { hi: '...', ta: '...' } map, falling back to the English name. */
export function localName(entity, lang) {
  if (!entity) return '';
  return (lang !== 'en' && entity.names?.[lang]) || entity.commonName || entity.name || '';
}

/**
 * Crop label for pickers and lists: the local name followed by the other names farmers use for
 * the same crop. A farmer looking for "Corn" has to find maize here, because picking the wrong
 * crop does not fail — it routes the photo to the wrong classifier and gets a confident answer.
 */
export function cropLabel(crop, lang) {
  if (!crop) return '';
  const primary = localName(crop, lang);
  const alt = [...(lang !== 'en' ? [crop.name] : []), ...(crop.aliases ?? [])].filter((n) => n && n !== primary);
  return alt.length ? `${primary} (${alt.join(', ')})` : primary;
}

export default i18n;
