import { CheckCircle2, Plus, Sprout, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePlots } from '../api/hooks.js';
import { useCropName } from '../components/domain.jsx';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { daysSince, relativeTime } from '../lib/format.js';

export default function Plots() {
  const { t, i18n } = useTranslation();
  const { data: plots, isLoading, error, refetch } = usePlots();
  const cropName = useCropName();

  const addButton = (
    <Link to="/plots/new" className="btn-primary">
      <Plus className="size-4" aria-hidden="true" />
      {t('plots.add')}
    </Link>
  );

  return (
    <div>
      <PageHeader title={t('plots.title')} actions={plots?.length ? addButton : null} />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !plots.length ? (
        <EmptyState icon={Sprout} title={t('plots.empty')} action={addButton} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plots.map((plot) => {
            const age = daysSince(plot.sowingDate);
            return (
              <li key={plot.id}>
                <Link to={`/plots/${plot.id}`} className="card block h-full p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">{plot.name}</p>
                      <p className="text-sm text-ink-muted">
                        {cropName(plot.crop)}
                        {plot.variety && ` · ${plot.variety}`}
                      </p>
                    </div>
                    {plot.lastScanAt &&
                      (plot.lastIsHealthy ? (
                        <CheckCircle2 className="size-5 shrink-0 text-ok" aria-label={t('status.healthy')} />
                      ) : (
                        <TriangleAlert className="size-5 shrink-0 text-warn" aria-hidden="true" />
                      ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {age != null && age >= 0 && <span>{t('plots.daysSinceSowing', { count: age })}</span>}
                    <span>{t('plots.scans', { count: plot.scanCount })}</span>
                    <span>{plot.lastScanAt ? t('plots.lastScan', { when: relativeTime(plot.lastScanAt, i18n.language) }) : t('plots.noScansYet')}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
