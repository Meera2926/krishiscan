import { z } from 'zod';

export const EARTH_RADIUS_KM = 6378.1;

export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

/** GeoJSON stores [lng, lat] — the reverse of how people usually say it. */
export const toPoint = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

export const fromPoint = (point) =>
  point?.coordinates ? { lat: point.coordinates[1], lng: point.coordinates[0] } : null;

/** Round to ~1.1 km so public outbreak data never pinpoints an individual farm. */
export const coarsen = (value, decimals = 2) => Number(value.toFixed(decimals));
