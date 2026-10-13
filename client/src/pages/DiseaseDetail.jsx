import { ArrowLeft, Leaf, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useDisease } from '../api/hooks.js';
import { DiseaseAdvice, useCropName } from '../components/domain.jsx';
import { ErrorState, FullPageSpinner, IconBadge, SeverityBadge } from '../components/ui.jsx';
import { localName } from '../i18n/index.js';

export default function DiseaseDetail() {
  const { key } = useParams();
  const { t, i18n } = useTranslation();
  const { data: disease, isLoading, error, refetch } = useDisease(key);
  const cropName = useCropName();

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/library?crop=${disease.crop}`} className="btn-ghost -ml-3 mb-3">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('library.title')}
      </Link>

      {/* A light panel rather than a bare title: the name, crop and severity are what a farmer checks first. */}
      <header className="animate-rise relative mb-6 overflow-hidden rounded-panel bg-gradient-to-br from-brand-100 via-brand-50 to-surface px-5 py-6 ring-1 ring-brand-200/60 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-brand-200/45 blur-3xl" aria-hidden="true" />
        <Leaf
          className="pointer-events-none absolute -bottom-6 right-5 size-32 -rotate-12 fill-brand-200/40 text-brand-300/50 max-sm:hidden"
          strokeWidth={0.75}
          aria-hidden="true"
        />
        <div className="relative flex items-start gap-4">
          <IconBadge icon={Leaf} tone="white" size="xl" className="shadow-[var(--shadow-sm)] max-sm:hidden" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[1.75rem] font-extrabold leading-[1.15] text-brand-900 sm:text-[2.125rem]">
              {localName(disease, i18n.language)}
              <SeverityBadge severity={disease.severity} />
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[15px] text-ink-muted">
              <span className="chip bg-surface py-1 text-brand-800 ring-1 ring-brand-700/10">
                <Sprout className="size-3.5" aria-hidden="true" />
                {cropName(disease.crop)}
              </span>
              {i18n.language !== 'en' && disease.commonName && <span>{disease.commonName}</span>}
            </p>
          </div>
        </div>
      </header>

      <article className="card p-5 sm:p-8">
        <DiseaseAdvice disease={disease} />
      </article>
    </div>
  );
}
