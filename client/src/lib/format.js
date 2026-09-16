export const pct = (x, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);

export function relativeTime(date, lang = 'en') {
  if (!date) return '';
  const diffSec = (new Date(date).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { numeric: 'auto' });
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(Math.round(diffSec), 'second');
}

export function shortDate(date, lang = 'en') {
  if (!date) return '';
  return new Date(date).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function weekday(isoDate, lang = 'en') {
  // Parse as a local calendar date, not UTC midnight, so the weekday is right in IST.
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric' });
}

export const daysSince = (date) => (date ? Math.floor((Date.now() - new Date(date).getTime()) / 864e5) : null);
