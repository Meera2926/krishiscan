import { ArrowRight, CalendarDays, CheckCircle2, Plus, ScanLine, Sprout, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { usePlots } from '../api/hooks.js';
import { useCropName } from '../components/domain.jsx';
import { EmptyState, ErrorState, IconBadge, PageHeader, Spinner } from '../components/ui.jsx';
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
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plots.map((plot) => {
            const age = daysSince(plot.sowingDate);
            const state = !plot.lastScanAt ? 'new' : plot.lastIsHealthy ? 'ok' : 'warn';
            // Three states worth distinguishing at a glance: never scanned, last scan clean, last
            // scan diseased. The badge tint and the chip carry it, so colour is never the only cue.
            const badgeTone = { new: 'white', ok: 'brand', warn: 'warn' }[state];

            return (
              <li key={plot.id}>
                <Link to={`/plots/${plot.id}`} className="card-interactive group flex h-full flex-col p-5">
                  <div className="flex items-start gap-3.5">
                    <IconBadge icon={Sprout} tone={badgeTone} size="lg" />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="truncate text-lg font-bold leading-snug text-brand-900 group-hover:text-brand-700">{plot.name}</p>
                      <p className="mt-0.5 truncate text-sm text-ink-muted">
                        {cropName(plot.crop)}
                        {plot.variety && ` · ${plot.variety}`}
                      </p>
                    </div>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-100">
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                  {state !== 'new' && (
                    <div className="mt-3.5 flex">
                      {state === 'ok' && (
                        <span className="chip bg-ok-bg text-ok ring-1 ring-ok/15">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          {t('status.healthy')}
                        </span>
                      )}
                      {state === 'warn' && (
                        <span className="chip bg-warn-bg text-warn ring-1 ring-warn/20">
                          <TriangleAlert className="size-3.5" aria-hidden="true" />
                          {t('plots.needsAttention')}
                        </span>
                      )}
                    </div>
                  )}

                  <dl className="mt-auto grid grid-cols-3 gap-2 pt-5 text-center">
                    <div className="rounded-control bg-surface-sunken px-2 py-3 ring-1 ring-line/70">
                      <dt className="sr-only">{t('plots.ageLabel')}</dt>
                      <dd className="text-lg font-extrabold leading-none text-brand-900 tabular-nums">{age != null && age >= 0 ? age : '—'}</dd>
                      <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-subtle">
                        <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
                        {t('plots.ageLabel')}
                      </p>
                    </div>
                    <div className="rounded-control bg-surface-sunken px-2 py-3 ring-1 ring-line/70">
                      <dt className="sr-only">{t('plots.scansLabel')}</dt>
                      <dd className="text-lg font-extrabold leading-none text-brand-900 tabular-nums">{plot.scanCount}</dd>
                      <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-ink-subtle">
                        <ScanLine className="size-3 shrink-0" aria-hidden="true" />
                        {t('plots.scansLabel')}
                      </p>
                    </div>
                    <div className="min-w-0 rounded-control bg-surface-sunken px-2 py-3 ring-1 ring-line/70">
                      <dt className="sr-only">{t('plots.lastLabel')}</dt>
                      <dd className="line-clamp-2 text-sm font-bold leading-[1.125rem] break-words text-brand-900">
                        {plot.lastScanAt ? relativeTime(plot.lastScanAt, i18n.language) : t('plots.never')}
                      </dd>
                      <p className="mt-1.5 truncate text-[11px] font-medium text-ink-subtle">{t('plots.lastLabel')}</p>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
