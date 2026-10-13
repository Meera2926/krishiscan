import { History as HistoryIcon, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { usePlots, useScans } from '../api/hooks.js';
import { ScanCard } from '../components/domain.jsx';
import { EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui.jsx';

/** Filter selects as rounded pills; on a phone they share the row instead of overflowing it. */
const FILTER = 'input w-auto min-w-0 max-w-full rounded-full pr-9 font-medium max-sm:flex-1';

export default function History() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: plots = [] } = usePlots();

  const filters = {
    page: Number(params.get('page') ?? 1),
    limit: 12,
    ...(params.get('status') && { status: params.get('status') }),
    ...(params.get('plotId') && { plotId: params.get('plotId') }),
  };
  const { data, isLoading, isFetching, error, refetch } = useScans(filters);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <div>
      <PageHeader
        title={t('history.title')}
        subtitle={data?.total ? t('history.count', { count: data.total }) : undefined}
      />
      {/* Filters sit in one soft toolbar as rounded pills, so they read as a single control group. */}
      <div className="card mb-6 flex flex-wrap items-center gap-3 p-3 sm:p-3.5">
        <span className="icon-badge size-9 max-sm:hidden" aria-hidden="true">
          <SlidersHorizontal className="size-4" />
        </span>
        <select className={FILTER} value={params.get('status') ?? ''} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">{t('history.filterStatus')}</option>
          {['confident', 'uncertain', 'rejected'].map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        {plots.length > 0 && (
          <select className={FILTER} value={params.get('plotId') ?? ''} onChange={(e) => setFilter('plotId', e.target.value)} aria-label={t('scan.plot')}>
            <option value="">{t('plots.title')}</option>
            {plots.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {isFetching && !isLoading && <Spinner className="size-4 self-center" />}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={t('history.empty')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((scan) => (
              <ScanCard key={scan.id} scan={scan} />
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages} onChange={(p) => setFilter('page', String(p))} />
        </>
      )}
    </div>
  );
}
