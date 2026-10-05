import { ArrowRight, CalendarDays, CheckCircle2, Plus, ScanLine, Sprout, TriangleAlert } from 'lucide-react';
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
      <PageHeader
        title={t('plots.title')}
        subtitle={plots?.length ? t('plots.subtitle') : undefined}
        actions={plots?.length ? addButton : null}
      />
      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !plots.length ? (
        <EmptyState icon={Sprout} title={t('plots.empty')} body={t('plots.emptyBody')} action={addButton} />
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {plots.map((plot) => {
            const age = daysSince(plot.sowingDate);
            // Three states worth distinguishing at a glance: never scanned, last scan clean,
            // last scan diseased. The strip down the card carries it without a colour bar.
            const state = !plot.lastScanAt ? 'new' : plot.lastIsHealthy ? 'ok' : 'warn';
            const accent = { new: 'from-line-strong to-line', ok: 'from-brand-400 to-brand-600', warn: 'from-warn to-danger' }[state];

            return (
              <li key={plot.id}>
                <Link to={`/plots/${plot.id}`} className="card-interactive group flex h-full items-stretch gap-4 overflow-hidden p-0">
                  <span className={`w-1.5 shrink-0 bg-gradient-to-b ${accent}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1 py-5 pr-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold group-hover:text-brand-700">{plot.name}</p>
                        <p className="mt-0.5 truncate text-sm text-ink-muted">
                          {cropName(plot.crop)}
                          {plot.variety && ` · ${plot.variety}`}
                        </p>
                      </div>
                      {state === 'ok' && (
                        <span className="chip shrink-0 bg-ok-bg text-ok ring-1 ring-ok/15">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          {t('status.healthy')}
                        </span>
                      )}
                      {state === 'warn' && (
                        <span className="chip shrink-0 bg-warn-bg text-warn ring-1 ring-warn/20">
                          <TriangleAlert className="size-3.5" aria-hidden="true" />
                          {t('plots.needsAttention')}
                        </span>
                      )}
                    </div>

                    <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
                      <div>
                        <dt className="sr-only">{t('plots.ageLabel')}</dt>
                        <dd className="text-lg font-extrabold leading-none tabular-nums">{age != null && age >= 0 ? age : '—'}</dd>
                        <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-subtle">
                          <CalendarDays className="size-3" aria-hidden="true" />
                          {t('plots.ageLabel')}
                        </p>
                      </div>
                      <div>
                        <dt className="sr-only">{t('plots.scansLabel')}</dt>
                        <dd className="text-lg font-extrabold leading-none tabular-nums">{plot.scanCount}</dd>
                        <p className="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-subtle">
                          <ScanLine className="size-3" aria-hidden="true" />
                          {t('plots.scansLabel')}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <dt className="sr-only">{t('plots.lastLabel')}</dt>
                        <dd className="truncate text-sm font-bold leading-tight">
                          {plot.lastScanAt ? relativeTime(plot.lastScanAt, i18n.language) : t('plots.never')}
                        </dd>
                        <p className="mt-1.5 text-[11px] font-medium text-ink-subtle">{t('plots.lastLabel')}</p>
                      </div>
                    </dl>
                  </div>
                  <span className="grid w-10 shrink-0 place-items-center text-ink-subtle">
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
