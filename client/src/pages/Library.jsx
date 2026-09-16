import { BookOpen, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useDiseases } from '../api/hooks.js';
import { CropSelect, useCropName } from '../components/domain.jsx';
import { EmptyState, ErrorState, PageHeader, SeverityBadge, Spinner } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';

export default function Library() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const q = useDeferredValue(query.trim());
  const crop = params.get('crop') ?? '';
  const cropName = useCropName();

  const { data: diseases, isLoading, isFetching, error, refetch } = useDiseases({ ...(crop && { crop }), ...(q.length >= 2 && { q }) });

  const byCrop = Object.groupBy(diseases ?? [], (d) => d.crop);

  return (
    <div>
      <PageHeader title={t('library.title')} subtitle={t('library.subtitle')} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">{t('library.search')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input type="search" className="input pl-9" placeholder={t('library.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="sm:w-56">
          <CropSelect
            value={crop}
            allowAll
            allLabel={t('library.allCrops')}
            onlySupported={false}
            onChange={(value) => {
              const next = new URLSearchParams(params);
              if (value) next.set('crop', value);
              else next.delete('crop');
              setParams(next, { replace: true });
            }}
          />
        </div>
        {isFetching && !isLoading && <Spinner className="size-4 self-center" />}
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !diseases.length ? (
        <EmptyState icon={BookOpen} title={t('library.empty')} />
      ) : (
        <div className="space-y-8">
          {Object.entries(byCrop).map(([cropKey, list]) => (
            <section key={cropKey}>
              <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold">
                {cropName(cropKey)}
                <span className="text-sm font-normal text-ink-muted">{t('library.diseases', { count: list.length })}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((d) => (
                  <li key={d.key}>
                    <Link to={`/library/${d.key}`} className="card flex h-full flex-col gap-1 p-4 transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{localName(d, i18n.language)}</p>
                        <SeverityBadge severity={d.severity} />
                      </div>
                      {i18n.language !== 'en' && d.names?.[i18n.language] && <p className="text-xs text-ink-muted">{d.commonName}</p>}
                      <p className="text-sm text-ink-muted">
                        {t(`library.agent.${d.causalAgentType}`)}
                        {d.pathogen && (
                          <>
                            {' · '}
                            <em>{d.pathogen}</em>
                          </>
                        )}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
