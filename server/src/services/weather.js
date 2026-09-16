import { config } from '../config/env.js';
import { serviceUnavailable } from '../utils/httpError.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map();

// Hourly series are fetched rather than daily aggregates because the disease models need
// "hours at or above 90% relative humidity", the usual proxy for leaf wetness duration.
const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'precipitation'];
const DAILY = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'precipitation_hours'];

/**
 * 7-day forecast (plus 3 days of recent history, which the multi-day rules need)
 * summarised per local day. Open-Meteo is free for non-commercial use and needs no API key.
 */
export async function getDailyWeather(lat, lng, { pastDays = 3, forecastDays = 7 } = {}) {
  // ~1 km grid: nearby plots share one upstream request.
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${pastDays},${forecastDays}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const url = new URL(config.WEATHER_API_BASE);
  url.search = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: 'auto',
  }).toString();

  let body;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    body = await res.json();
    if (!res.ok) throw new Error(body?.reason ?? `HTTP ${res.status}`);
  } catch (err) {
    console.warn('[weather] forecast fetch failed:', err.message);
    throw serviceUnavailable('Weather forecast is temporarily unavailable. Please try again shortly.');
  }

  const value = summarise(body);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

export function summarise(body) {
  const { hourly, daily } = body;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: body.timezone });

  const days = daily.time.map((date, i) => {
    const hours = [];
    for (let h = 0; h < hourly.time.length; h += 1) {
      if (hourly.time[h].startsWith(date)) {
        hours.push({ t: hourly.temperature_2m[h], rh: hourly.relative_humidity_2m[h], p: hourly.precipitation[h] });
      }
    }
    const valid = hours.filter((x) => x.t != null && x.rh != null);
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

    const humid = valid.filter((x) => x.rh >= 90);
    return {
      date,
      isForecast: date >= today,
      tmin: daily.temperature_2m_min[i],
      tmax: daily.temperature_2m_max[i],
      tmean: round(mean(valid.map((x) => x.t))),
      rhMean: round(mean(valid.map((x) => x.rh))),
      rhMax: valid.length ? Math.max(...valid.map((x) => x.rh)) : null,
      rhMin: valid.length ? Math.min(...valid.map((x) => x.rh)) : null,
      // Leaf-wetness proxy used by the risk models.
      hoursRh90: humid.length,
      // Mean temperature during those humid hours, needed by DSV-style models.
      tmeanHumid: round(mean(humid.map((x) => x.t))),
      rainMm: daily.precipitation_sum[i],
      rainHours: daily.precipitation_hours[i],
    };
  });

  return {
    source: 'open-meteo',
    latitude: body.latitude,
    longitude: body.longitude,
    timezone: body.timezone,
    days,
  };
}

const round = (n) => (n == null ? null : Math.round(n * 10) / 10);
