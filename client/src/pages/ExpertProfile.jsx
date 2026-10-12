import { ArrowLeft, BadgeCheck, MessageSquareQuote, UserCheck, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useExpertProfile } from '../api/hooks.js';
import { ExpertFacts } from '../components/experts.jsx';
import { RatingDistribution, Stars, formatAverage } from '../components/ratings.jsx';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const FACT_FIELDS = ['degree', 'specialisation', 'university', 'organisation', 'designation', 'experienceYears', 'place', 'languages', 'modes', 'crops'];

function RatingPanel({ rating }) {
  const { t } = useTranslation();
  const rated = rating?.count > 0 && rating.average != null;
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 font-bold">{t('expert.profile.ratingsTitle')}</h2>
      {rated ? (
        <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="text-center sm:pr-6 sm:text-left">
            <p className="text-5xl font-extrabold leading-none tabular-nums">{formatAverage(rating.average)}</p>
            <Stars value={rating.average} size="size-5" className="mt-2" />
            <p className="mt-1.5 text-sm text-ink-muted">{t('rating.count', { count: rating.count })}</p>
          </div>
          <RatingDistribution distribution={rating.distribution} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t('rating.none')}</p>
      )}
    </section>
  );
}

function Reviews({ reviews }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-bold">{t('expert.profile.reviewsTitle')}</h2>
      {/* Said out loud, so a farmer reading these knows why there are no names, and a farmer
          writing one knows the expert will not see theirs. */}
      <p className="mt-1 text-xs text-ink-subtle">{t('expert.profile.anonymous')}</p>
      {reviews?.length ? (
        <ul className="mt-4 divide-y divide-line">
          {reviews.map((r, i) => (
            <li key={`${r.createdAt}-${i}`} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={r.stars} />
                <span className="text-xs text-ink-subtle">{shortDate(r.createdAt, i18n.language)}</span>
              </div>
              {r.comment && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.comment}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <MessageSquareQuote className="size-4 shrink-0" aria-hidden="true" />
          {t('expert.profile.noReviews')}
        </p>
      )}
    </section>
  );
}

/**
 * Everything a farmer can check before trusting someone with their crop: the degree and where it
 * is from, where they work, and what farmers they advised before thought of it.
 */
export default function ExpertProfile() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: expert, isLoading, error, refetch } = useExpertProfile(id);

  // Opened in its own tab from the booking form there is nothing to go back to.
  const back = (
    <button
      type="button"
      className="btn-ghost -ml-3 mb-2"
      onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/dashboard'))}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('common.back')}
    </button>
  );

  if (isLoading) return <Spinner />;
  if (error?.response?.status === 404) {
    return (
      <div className="mx-auto max-w-xl">
        {back}
        <EmptyState icon={UserX} title={t('expert.profile.notFound')} body={t('expert.profile.notFoundBody')} />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!expert) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader back={back} eyebrow={t('expert.profile.eyebrow')} title={expert.name} />

      <section className="card p-5 sm:p-6">
        <div className="flex gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-panel bg-gradient-to-br from-brand-500 to-brand-800 text-white ring-1 ring-brand-900/15">
            <UserCheck className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            {expert.verified && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="chip bg-ok-bg text-ok ring-1 ring-ok/15">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  {t('expert.verified')}
                </span>
                {expert.verifiedSince && (
                  <span className="text-xs text-ink-subtle">{t('expert.verifiedSince', { date: shortDate(expert.verifiedSince, i18n.language) })}</span>
                )}
              </p>
            )}
            {expert.qualification && <p className="mt-2 text-lg font-bold leading-snug text-brand-700">{expert.qualification}</p>}
            {(expert.designation || expert.organisation) && (
              <p className="mt-0.5 text-sm text-ink-muted">{[expert.designation, expert.organisation].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-subtle">{t('expert.profile.checkedNote')}</p>
        <ExpertFacts expert={expert} fields={FACT_FIELDS} className="mt-5 border-t border-line pt-5" />
        {expert.bio && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.field.bio')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{expert.bio}</p>
          </div>
        )}
      </section>

      <RatingPanel rating={expert.rating} />
      {expert.rating?.count > 0 && <Reviews reviews={expert.reviews} />}
    </div>
  );
}
