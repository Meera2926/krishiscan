import clsx from 'clsx';
import { ArrowLeft, Camera, CloudRain, Droplets, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeletePlot, usePlot, usePlotRisk, useScans } from '../api/hooks.js';
import { RiskLevelBadge, ScanCard, useCropName } from '../components/domain.jsx';
import { Alert, EmptyState, ErrorState, FullPageSpinner, PageHeader, Spinner } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';
import { daysSince, weekday } from '../lib/format.js';

function RiskPanel({ plotId }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error } = usePlotRisk(plotId);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const forecast = data.weather.days.filter((d) => d.isForecast).slice(0, 7);
  const levelTone = { high: 'border-l-danger', moderate: 'border-l-warn', low: 'border-l-ok', unknown: 'border-l-line' };

  return (
    <div className="space-y-4">
      {!data.supported || data.assessments.length === 0 ? (
        <Alert tone="info">{t('risk.unsupported')}</Alert>
      ) : (
        <ul className="space-y-3">
          {data.assessments.map((a) => (
            <li key={a.ruleId} className={clsx('rounded-xl border border-l-4 border-line bg-surface p-4', levelTone[a.level])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{localName(a, i18n.language)}</p>
                <RiskLevelBadge level={a.level} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">{a.reason}</p>
              {a.preventive?.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-brand-700">{t('risk.prevent')}</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {a.preventive.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="mt-2 text-[11px] text-ink-muted">{a.model}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[520px] text-center text-xs">
          <caption className="sr-only">{t('risk.forecast')}</caption>
          <thead>
            <tr className="text-ink-muted">
              <th className="py-1 text-left font-medium">{t('risk.forecast')}</th>
              {forecast.map((d) => (
                <th key={d.date} className="py-1 font-medium">
                  {weekday(d.date, i18n.language)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr>
              <th className="py-1 text-left font-medium text-ink-muted">°C</th>
              {forecast.map((d) => (
                <td key={d.date} className="py-1">
                  {Math.round(d.tmin)}–{Math.round(d.tmax)}
                </td>
              ))}
            </tr>
            <tr>
              <th className="py-1 text-left font-medium text-ink-muted">
                <Droplets className="mr-1 inline size-3" aria-hidden="true" />
                {t('risk.humidHours')}
              </th>
              {forecast.map((d) => (
                <td key={d.date} className={clsx('py-1', d.hoursRh90 >= 10 && 'font-semibold text-info')}>
                  {d.hoursRh90}h
                </td>
              ))}
            </tr>
            <tr>
              <th className="py-1 text-left font-medium text-ink-muted">
                <CloudRain className="mr-1 inline size-3" aria-hidden="true" />
                {t('risk.rain')}
              </th>
              {forecast.map((d) => (
                <td key={d.date} className="py-1">
                  {d.rainMm != null ? `${Math.round(d.rainMm)}mm` : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">{data.disclaimer} · Open-Meteo</p>
    </div>
  );
}

export default function PlotDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: plot, isLoading, error, refetch } = usePlot(id);
  const scans = useScans({ plotId: id, limit: 6 });
  const deletePlot = useDeletePlot();
  const cropName = useCropName();

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const age = daysSince(plot.sowingDate);

  return (
    <div>
      <PageHeader
        title={plot.name}
        subtitle={[cropName(plot.crop), plot.variety, age != null && age >= 0 && t('plots.daysSinceSowing', { count: age })].filter(Boolean).join(' · ')}
        back={
          <Link to="/plots" className="btn-ghost -ml-3 mb-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('plots.title')}
          </Link>
        }
        actions={
          <>
            <Link to={`/scan?plot=${plot.id}`} className="btn-primary">
              <Camera className="size-4" aria-hidden="true" />
              {t('plots.scanThisPlot')}
            </Link>
            <Link to={`/plots/${plot.id}/edit`} className="btn-secondary" aria-label={t('common.edit')}>
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="btn-danger"
              aria-label={t('common.delete')}
              disabled={deletePlot.isPending}
              onClick={() => {
                if (window.confirm(t('common.confirmDelete'))) {
                  deletePlot.mutate(plot.id, { onSuccess: () => navigate('/plots', { replace: true }) });
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-5">
          <h2 className="text-lg font-semibold">{t('risk.title')}</h2>
          <p className="mb-4 text-sm text-ink-muted">{t('risk.subtitle')}</p>
          <RiskPanel plotId={plot.id} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">{t('dashboard.recentScans')}</h2>
          {scans.isLoading ? (
            <Spinner />
          ) : scans.data?.items.length ? (
            <div className="space-y-3">
              {scans.data.items.map((scan) => (
                <ScanCard key={scan.id} scan={scan} />
              ))}
              {scans.data.total > scans.data.items.length && (
                <Link to={`/history?plotId=${plot.id}`} className="btn-secondary w-full">
                  {t('common.viewAll')}
                </Link>
              )}
            </div>
          ) : (
            <EmptyState icon={Camera} title={t('plots.noScansYet')} />
          )}
        </section>
      </div>
    </div>
  );
}
