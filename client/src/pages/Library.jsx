import clsx from 'clsx';
import { Biohazard, BookOpen, Bug, ChevronRight, CloudSun, Droplets, FlaskConical, Leaf, Microscope, Search, Sprout } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useDiseases } from '../api/hooks.js';
import { CropSelect, useCropName } from '../components/domain.jsx';
import { EmptyState, ErrorState, IconBadge, PageHeader, SeverityBadge, Spinner } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';

/** One glyph per kind of cause, so a list of names can be scanned by type before it is read. */
const AGENT_ICONS = {
  fungal: Sprout,
  bacterial: Microscope,
  viral: Biohazard,
  oomycete: Droplets,
  pest: Bug,
  deficiency: FlaskConical,
  abiotic: CloudSun,
};

/** Soft tints for the crop tiles; a crop keeps its tint because it is picked from the key, not the order. */
const CROP_TINTS = [
  'bg-brand-100 text-brand-700 ring-brand-700/10',
  'bg-accent-100 text-accent-700 ring-accent-700/15',
  'bg-soil-100 text-soil-700 ring-soil-500/20',
  'bg-ok-bg text-ok ring-ok/15',
  'bg-info-bg text-info ring-info/15',
];

function cropTint(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CROP_TINTS[h % CROP_TINTS.length];
}

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
      <div className="card mb-8 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <label className="relative flex-1">
          <span className="sr-only">{t('library.search')}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-brand-600" aria-hidden="true" />
          <input
            type="search"
            className="input rounded-full bg-surface-sunken pl-10"
            placeholder={t('library.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-3 sm:w-64">
          <div className="min-w-0 flex-1 [&_select]:rounded-full [&_select]:bg-surface-sunken">
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
          {isFetching && !isLoading && <Spinner className="size-4 shrink-0" />}
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !diseases.length ? (
        <EmptyState icon={BookOpen} title={t('library.empty')} />
      ) : (
        <div className="space-y-10">
          {Object.entries(byCrop).map(([cropKey, list]) => (
            <section key={cropKey}>
              <h2 className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-bold text-brand-900">
                <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl ring-1', cropTint(cropKey))} aria-hidden="true">
                  <Leaf className="size-5" />
                </span>
                {cropName(cropKey)}
                <span className="chip bg-surface text-ink-muted ring-1 ring-line">{t('library.diseases', { count: list.length })}</span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((d) => (
                  <li key={d.key}>
                    <Link to={`/library/${d.key}`} className="card-interactive group flex h-full flex-col gap-3 p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <IconBadge icon={AGENT_ICONS[d.causalAgentType] ?? Leaf} />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="font-bold leading-snug text-brand-900">{localName(d, i18n.language)}</p>
                          {i18n.language !== 'en' && d.names?.[i18n.language] && <p className="mt-0.5 text-xs text-ink-muted">{d.commonName}</p>}
                        </div>
                        <span className="shrink-0 whitespace-nowrap">
                          <SeverityBadge severity={d.severity} />
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <p className="text-sm leading-relaxed text-ink-muted">
                          <span className="font-semibold text-ink">{t(`library.agent.${d.causalAgentType}`)}</span>
                          {d.pathogen && (
                            <>
                              {' · '}
                              <em>{d.pathogen}</em>
                            </>
                          )}
                        </p>
                        <ChevronRight
                          className="mt-auto size-4 self-end text-brand-500 transition-transform duration-200 group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </div>
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
