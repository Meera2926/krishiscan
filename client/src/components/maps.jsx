import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

// Geographic centre of India, used before we know where the farmer is.
export const INDIA_CENTER = { lat: 22.5, lng: 79.0 };

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
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
    <MapContainer center={[center.lat, center.lng]} zoom={value ? 14 : 5} className={`${className} w-full rounded-xl`} scrollWheelZoom={false}>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <ClickHandler onPick={onChange} />
      {value && (
        <>
          <Recenter center={value} minZoom={14} />
          <CircleMarker center={[value.lat, value.lng]} radius={10} pathOptions={{ color: '#166534', fillColor: '#22a55a', fillOpacity: 0.8, weight: 3 }} />
        </>
      )}
    </MapContainer>
  );
}

const SEVERITY_COLORS = { severe: '#b91c1c', moderate: '#c2410c', low: '#a16207' };

/** Outbreak cells: circle area scales with report count, colour with severity. */
export function OutbreakMap({ center, radiusKm, cells, className = 'h-[28rem]', renderTooltip }) {
  const zoom = radiusKm > 150 ? 7 : radiusKm > 60 ? 8 : radiusKm > 25 ? 9 : 10;
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={`${className} w-full rounded-2xl`} scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <Recenter center={center} zoom={zoom} />
      <Circle
        center={[center.lat, center.lng]}
        radius={radiusKm * 1000}
        pathOptions={{ color: '#166534', weight: 1, dashArray: '4 6', fillOpacity: 0.03 }}
      />
      {cells.map((cell) => (
        <CircleMarker
          key={`${cell.lat},${cell.lng},${cell.diseaseKey}`}
          center={[cell.lat, cell.lng]}
          radius={6 + Math.sqrt(cell.count) * 5}
          pathOptions={{
            color: SEVERITY_COLORS[cell.severity] ?? '#a16207',
            fillColor: SEVERITY_COLORS[cell.severity] ?? '#a16207',
            fillOpacity: 0.35,
            weight: 2,
          }}
        >
          <Tooltip>{renderTooltip(cell)}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
