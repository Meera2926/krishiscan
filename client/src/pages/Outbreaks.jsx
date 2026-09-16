import { LocateFixed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOutbreakMap, usePlots } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CropSelect, useCropName } from '../components/domain.jsx';
import { INDIA_CENTER, OutbreakMap } from '../components/maps.jsx';
import { ErrorState, PageHeader, SeverityBadge, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';
import { useGeolocation } from '../lib/useGeolocation.js';

export default function Outbreaks() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: plots } = usePlots({ enabled: Boolean(user) });
  const geo = useGeolocation();
  const cropName = useCropName();

  const [center, setCenter] = useState(null);
  const [radiusKm, setRadiusKm] = useState(100);
  const [days, setDays] = useState(30);
  const [crop, setCrop] = useState('');

  // Start from the farmer's first plot if there is one, otherwise the middle of India.
  useEffect(() => {
    if (center) return;
    if (plots?.length) setCenter({ lat: plots[0].lat, lng: plots[0].lng });
    else if (!user || plots) setCenter(INDIA_CENTER);
  }, [plots, user, center]);

  useEffect(() => {
    if (geo.coords) setCenter(geo.coords);
  }, [geo.coords]);

  const isCountryView = center === INDIA_CENTER;
  const effectiveRadius = isCountryView ? 300 : radiusKm;
  const { data, isLoading, isFetching, error, refetch } = useOutbreakMap({
    lat: center?.lat,
    lng: center?.lng,
    radiusKm: effectiveRadius,
    days,
    ...(crop && { crop }),
  });

  return (
    <div>
      <PageHeader title={t('outbreaks.title')} subtitle={t('outbreaks.subtitle')} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <button type="button" className="btn-secondary" onClick={geo.request} disabled={geo.status === 'loading'}>
          {geo.status === 'loading' ? <Spinner className="size-4" /> : <LocateFixed className="size-4" aria-hidden="true" />}
          {t('outbreaks.locateMe')}
        </button>
        {plots?.length > 0 &&
          plots.map((p) => (
            <button key={p.id} type="button" className="btn-ghost border border-line" onClick={() => setCenter({ lat: p.lat, lng: p.lng })}>
              {p.name}
            </button>
          ))}
        <label className="text-sm">
          <span className="label">{t('outbreaks.radius')}</span>
          <select className="input w-auto" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={isCountryView}>
            {[10, 25, 50, 100, 200].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">{t('outbreaks.period')}</span>
          <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>
                {t('outbreaks.days', { count: d })}
              </option>
            ))}
          </select>
        </label>
        <div className="w-48">
          <CropSelect value={crop} onChange={setCrop} allowAll allLabel={t('outbreaks.allCrops')} onlySupported={false} />
        </div>
        {isFetching && <Spinner className="mb-3 size-4" />}
      </div>

      {geo.status === 'error' && <p className="mb-3 text-sm text-danger">{t('scan.locationFailed')}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {!center || isLoading ? (
            <div className="card grid h-[28rem] place-items-center">
              <Spinner className="size-6" />
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : (
            <OutbreakMap
              center={center}
              radiusKm={effectiveRadius}
              cells={data?.cells ?? []}
              renderTooltip={(cell) => (
                <div className="text-xs">
                  <p className="font-semibold">{cell.commonName}</p>
                  <p>{cropName(cell.crop)} · {t('outbreaks.reports', { count: cell.count })}</p>
                  <p>
                    {t('outbreaks.lastSeen')}: {shortDate(cell.lastSeen, i18n.language)}
                  </p>
                </div>
              )}
            />
          )}
          <p className="mt-2 text-xs text-ink-muted">{t('outbreaks.legend')}</p>
        </div>

        <aside className="card h-fit p-4">
          {data?.diseases?.length ? (
            <ul className="divide-y divide-line">
              {data.diseases.map((d) => (
                <li key={d.diseaseKey} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/library/${d.diseaseKey}`} className="block truncate font-medium hover:underline">
                      {d.commonName}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {cropName(d.crop)} · {t('outbreaks.reports', { count: d.reports })}
                    </p>
                  </div>
                  <SeverityBadge severity={d.severity} />
                </li>
              ))}
            </ul>
          ) : (
            !isLoading && <p className="text-sm text-ink-muted">{t('outbreaks.none')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
