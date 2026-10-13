import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

// Geographic centre of India, used before we know where the farmer is.
export const INDIA_CENTER = { lat: 22.5, lng: 79.0 };

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Leaflet paints with raw colours, not CSS classes, so the palette's values are repeated here.
const BRAND = { line: '#1f5d31', fill: '#3f8c46' };
// Soft rounded frame shared by both maps, so they sit on the page like cards. The container inherits
// the page font size, so the attribution is set back to a footnote size.
const FRAME = 'w-full rounded-card ring-1 ring-line-strong shadow-[var(--shadow-sm)] [&_.leaflet-control-attribution]:text-[11px]!';
// Leaflet's own stylesheet is unlayered and outranks utilities, hence the important modifiers.
const TOOLTIP = 'rounded-control! border-line! bg-surface! px-3! py-2! text-ink! shadow-[var(--shadow-md)]!';

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function Recenter({ center, zoom, minZoom }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    const next = zoom ?? Math.max(map.getZoom(), minZoom ?? 0);
    map.setView([center.lat, center.lng], next, { animate: true });
  }, [center?.lat, center?.lng, zoom, minZoom, map]);
  return null;
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: Number(e.latlng.lat.toFixed(5)), lng: Number(e.latlng.lng.toFixed(5)) });
    },
  });
  return null;
}

/** Click-to-place location picker. CircleMarker avoids Leaflet's bundler-unfriendly image icons. */
export function MapPicker({ value, onChange, className = 'h-72' }) {
  const center = value ?? INDIA_CENTER;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={value ? 14 : 5} className={`${className} ${FRAME}`} scrollWheelZoom={false}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <ClickHandler onPick={onChange} />
      {value && (
        <>
          <Recenter center={value} minZoom={14} />
          <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: BRAND.line, fillColor: BRAND.fill, fillOpacity: 0.85, weight: 3 }} />
        </>
      )}
    </MapContainer>
  );
}

/** Severity hues on the map: danger red, a warm orange, and the palette's deep amber. */
export const SEVERITY_COLORS = { severe: '#c42b2b', moderate: '#d0701c', low: '#a9800f' };

/** Outbreak cells: circle area scales with report count, colour with severity. */
export function OutbreakMap({ center, radiusKm, cells, className = 'h-[28rem]', renderTooltip }) {
  const zoom = radiusKm > 900 ? 4 : radiusKm > 150 ? 7 : radiusKm > 60 ? 8 : radiusKm > 25 ? 9 : 10;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={`${className} ${FRAME}`} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <Recenter center={center} zoom={zoom} />
      {radiusKm <= 300 && (
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: BRAND.line, weight: 1.5, dashArray: '4 6', fillColor: BRAND.fill, fillOpacity: 0.05 }}
        />
      )}
      {cells.map((cell) => (
        <CircleMarker
          key={`${cell.lat},${cell.lng},${cell.diseaseKey}`}
          center={[cell.lat, cell.lng]}
          radius={6 + Math.sqrt(cell.count) * 5}
          pathOptions={{
            color: SEVERITY_COLORS[cell.severity] ?? SEVERITY_COLORS.low,
            fillColor: SEVERITY_COLORS[cell.severity] ?? SEVERITY_COLORS.low,
            fillOpacity: 0.35,
            weight: 2,
          }}
        >
          <Tooltip className={TOOLTIP}>{renderTooltip(cell)}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
