import { LocateFixed, ShieldCheck, Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useOutbreakMap, usePlots } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { CropSelect, useCropName } from '../components/domain.jsx';
import { INDIA_CENTER, OutbreakMap, SEVERITY_COLORS } from '../components/maps.jsx';
import { ErrorState, IconBadge, PageHeader, SeverityBadge, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';
import { useGeolocation } from '../lib/useGeolocation.js';

/** Filter selects as rounded pills, matching the location buttons beside them. */
const FILTER = 'input w-full rounded-full pr-9 font-medium sm:w-auto';

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

  // Before the farmer picks a location the map shows the whole country.
  const isCountryView = center === INDIA_CENTER;
  const effectiveRadius = isCountryView ? 1800 : radiusKm;
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

      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-outline btn-pill px-4" onClick={geo.request} disabled={geo.status === 'loading'}>
            {geo.status === 'loading' ? <Spinner className="size-4" /> : <LocateFixed className="size-4" aria-hidden="true" />}
            {t('outbreaks.locateMe')}
          </button>
          {plots?.length > 0 &&
            plots.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn min-h-10 rounded-full bg-brand-50 px-4 text-sm text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100"
                onClick={() => setCenter({ lat: p.lat, lng: p.lng })}
              >
                <Sprout className="size-4" aria-hidden="true" />
                {p.name}
              </button>
            ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <label className="w-full text-sm sm:w-auto">
            <span className="label">{t('outbreaks.radius')}</span>
            <select className={FILTER} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} disabled={isCountryView}>
              {[10, 25, 50, 100, 200].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
          <label className="w-full text-sm sm:w-auto">
            <span className="label">{t('outbreaks.period')}</span>
            <select className={FILTER} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {t('outbreaks.days', { count: d })}
                </option>
              ))}
            </select>
          </label>
          <label className="w-full text-sm sm:w-52">
            <span className="label">{t('scan.crop')}</span>
            {/* CropSelect brings its own input styling; the wrapper rounds it to match the other filters. */}
            <span className="block [&_select]:rounded-full [&_select]:font-medium">
              <CropSelect value={crop} onChange={setCrop} allowAll allLabel={t('outbreaks.allCrops')} onlySupported={false} />
            </span>
          </label>
          {isFetching && <Spinner className="mb-3 size-4" />}
        </div>
      </div>

      {geo.status === 'error' && <p className="mb-4 text-sm font-medium text-danger">{t('scan.locationFailed')}</p>}

      {/* minmax(0,…) and min-w-0 keep a long disease name from widening the column past a phone screen. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
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
                <div className="space-y-0.5 text-xs leading-relaxed">
                  <p className="text-sm font-bold text-brand-900">{cell.commonName}</p>
                  <p>{cropName(cell.crop)} · {t('outbreaks.reports', { count: cell.count })}</p>
                  <p className="text-ink-muted">
                    {t('outbreaks.lastSeen')}: {shortDate(cell.lastSeen, i18n.language)}
                  </p>
                </div>
              )}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
            <p>{t('outbreaks.legend')}</p>
            {/* Which colour is which severity, so the circles can be read without hovering. */}
            <ul className="flex flex-wrap gap-x-4 gap-y-1 font-medium" aria-hidden="true">
              {['severe', 'moderate', 'low'].map((sev) => (
                <li key={sev} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full ring-2 ring-current/25" style={{ backgroundColor: SEVERITY_COLORS[sev], color: SEVERITY_COLORS[sev] }} />
                  <span className="text-ink-muted">{t(`severity.${sev}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="card h-fit min-w-0 p-2">
          {data?.diseases?.length ? (
            <ul className="divide-y divide-line">
              {data.diseases.map((d) => (
                <li key={d.diseaseKey} className="flex items-center justify-between gap-3 rounded-control px-3 py-3">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[d.severity] ?? SEVERITY_COLORS.low }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <Link to={`/library/${d.diseaseKey}`} className="block truncate font-semibold text-brand-900 hover:text-brand-700 hover:underline">
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
            !isLoading && (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <IconBadge icon={ShieldCheck} size="lg" className="mb-3" />
                <p className="text-sm text-ink-muted">{t('outbreaks.none')}</p>
              </div>
            )
          )}
        </aside>
      </div>
    </div>
  );
}
