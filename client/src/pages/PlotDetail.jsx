import clsx from 'clsx';
import { Activity, ArrowLeft, Camera, CloudRain, CloudSun, Droplets, FlaskConical, Pencil, ScanLine, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useDeletePlot, usePlot, usePlotRisk, useProgression, useScans } from '../api/hooks.js';
import { RiskLevelBadge, ScanCard, useCropName } from '../components/domain.jsx';
import { ProgressionSummary, SeverityChart, TreatmentLog, TrendBadge } from '../components/progression.jsx';
import { Alert, EmptyState, ErrorState, FullPageSpinner, PageHeader, SectionTitle, Spinner } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';
import { daysSince, weekday } from '../lib/format.js';

function RiskPanel({ plotId }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error } = usePlotRisk(plotId);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} />;

  const forecast = data.weather.days.filter((d) => d.isForecast).slice(0, 7);
  const levelTone = { high: 'border-l-danger', moderate: 'border-l-warn', low: 'border-l-ok', unknown: 'border-l-line-strong' };

  return (
    <div className="space-y-4">
      {!data.supported || data.assessments.length === 0 ? (
        <Alert tone="info">{t('risk.unsupported')}</Alert>
      ) : (
        <ul className="space-y-3">
          {data.assessments.map((a) => (
            <li key={a.ruleId} className={clsx('rounded-control border border-l-4 border-line bg-surface-sunken/70 p-4', levelTone[a.level])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-brand-900">{localName(a, i18n.language)}</p>
                <RiskLevelBadge level={a.level} />
              </div>
              <p className="mt-1 text-sm text-ink-muted">{a.reason}</p>
              {a.preventive?.length > 0 && (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-brand-700 hover:text-brand-900">{t('risk.prevent')}</summary>
                  <ul className="mt-2 space-y-1.5">
                    {a.preventive.map((p) => (
                      <li key={p} className="flex gap-2.5">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="mt-2 text-[11px] text-ink-subtle">{a.model}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-control bg-surface-sunken px-3 py-2 ring-1 ring-line">
        <table className="w-full min-w-[520px] text-center text-xs">
          <caption className="sr-only">{t('risk.forecast')}</caption>
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-2 text-left font-semibold text-brand-900">{t('risk.forecast')}</th>
              {forecast.map((d) => (
                <th key={d.date} className="py-2 font-semibold">
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
      <p className="text-xs leading-relaxed text-ink-muted">{data.disclaimer} · Open-Meteo</p>
    </div>
  );
}

function ProgressionCard({ plotId }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, error, refetch } = useProgression(plotId);

  return (
    <section className="card min-w-0 p-5 sm:p-6">
      <SectionTitle icon={Activity} className="flex-wrap" action={data && <TrendBadge trend={data.overall.summary.trend} />}>
        {t('progression.title')}
      </SectionTitle>
      <p className="mb-5 -mt-2.5 text-sm text-ink-muted sm:pl-[2.625rem]">{t('progression.subtitle')}</p>
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="space-y-4">
          <SeverityChart points={data.overall.points} treatments={data.treatments.items} />
          <ProgressionSummary summary={data.overall.summary} />
          {data.byDisease.filter((d) => d.summary.latestPercent != null).length > 1 && (
            <ul className="flex flex-wrap gap-2">
              {data.byDisease
                .filter((d) => d.summary.latestPercent != null)
                .map((d) => (
                  <li key={d.diseaseKey} className="chip bg-brand-50 text-brand-900 ring-1 ring-brand-200">
                    {localName(d, i18n.language)}: {d.summary.latestPercent}%
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function TreatmentsCard({ plot }) {
  const { data, isLoading, error, refetch } = useProgression(plot.id);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return <TreatmentLog plot={plot} treatments={data.treatments} diseaseOptions={data.byDisease.map((d) => d.diseaseKey)} />;
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
            <Link to={`/plots/${plot.id}/edit`} className="btn-secondary w-11 rounded-full px-0" aria-label={t('common.edit')}>
              <Pencil className="size-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              className="btn-danger w-11 rounded-full px-0"
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

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <ProgressionCard plotId={plot.id} />
        <section className="card min-w-0 p-5 sm:p-6">
          <SectionTitle icon={FlaskConical}>{t('treatments.title')}</SectionTitle>
          <TreatmentsCard plot={plot} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <section className="card min-w-0 p-5 sm:p-6">
          <SectionTitle icon={CloudSun} tone="info">
            {t('risk.title')}
          </SectionTitle>
          <p className="mb-5 -mt-2.5 text-sm text-ink-muted sm:pl-[2.625rem]">{t('risk.subtitle')}</p>
          <RiskPanel plotId={plot.id} />
        </section>

        <section className="min-w-0">
          <SectionTitle icon={ScanLine}>{t('dashboard.recentScans')}</SectionTitle>
          {scans.isLoading ? (
            <Spinner />
          ) : scans.data?.items.length ? (
            <div className="space-y-3">
              {scans.data.items.map((scan) => (
                <ScanCard key={scan.id} scan={scan} />
              ))}
              {scans.data.total > scans.data.items.length && (
                <Link to={`/history?plotId=${plot.id}`} className="btn-outline w-full">
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
