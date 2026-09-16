import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useDisease } from '../api/hooks.js';
import { DiseaseAdvice, useCropName } from '../components/domain.jsx';
import { ErrorState, FullPageSpinner, PageHeader, SeverityBadge } from '../components/ui.jsx';
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
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {localName(disease, i18n.language)}
            <SeverityBadge severity={disease.severity} />
          </span>
        }
        subtitle={[cropName(disease.crop), i18n.language !== 'en' && disease.commonName].filter(Boolean).join(' · ')}
        back={
          <Link to={`/library?crop=${disease.crop}`} className="btn-ghost -ml-3 mb-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('library.title')}
          </Link>
        }
      />
      <article className="card p-5 sm:p-6">
        <DiseaseAdvice disease={disease} />
      </article>
    </div>
  );
}
