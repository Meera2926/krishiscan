import { ArrowLeft, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useDisease } from '../api/hooks.js';
import { DiseaseAdvice, useCropName } from '../components/domain.jsx';
import { ErrorState, FullPageSpinner, HeroPanel, SeverityBadge } from '../components/ui.jsx';
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

      {/* The shared hero rather than a bare title: the name, crop and severity are what a farmer checks first. */}
      <HeroPanel
        className="mb-6"
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {localName(disease, i18n.language)}
            <SeverityBadge severity={disease.severity} />
          </span>
        }
        subtitle={
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="chip bg-surface py-1 text-brand-800 ring-1 ring-brand-700/10">
              <Sprout className="size-3.5" aria-hidden="true" />
              {cropName(disease.crop)}
            </span>
            {i18n.language !== 'en' && disease.commonName && <span>{disease.commonName}</span>}
          </span>
        }
      />

      <article className="card p-5 sm:p-8">
        <DiseaseAdvice disease={disease} />
      </article>
    </div>
  );
}
