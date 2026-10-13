import { ArrowLeft, BadgeCheck, ClipboardList, Leaf, MessageSquareQuote, ShieldCheck, Star, UserCheck, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useExpertProfile } from '../api/hooks.js';
import { ExpertFacts } from '../components/experts.jsx';
import { RatingDistribution, Stars, formatAverage } from '../components/ratings.jsx';
import { EmptyState, ErrorState, SectionTitle, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

const FACT_FIELDS = ['degree', 'specialisation', 'university', 'organisation', 'designation', 'experienceYears', 'place', 'languages', 'modes', 'crops'];

function RatingPanel({ rating }) {
  const { t } = useTranslation();
  const rated = rating?.count > 0 && rating.average != null;
  return (
    <section className="card p-5 sm:p-6">
      <SectionTitle icon={Star} tone="accent">
        {t('expert.profile.ratingsTitle')}
      </SectionTitle>
      {rated ? (
        <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="rounded-card bg-accent-50 px-6 py-5 text-center ring-1 ring-accent-500/20 sm:min-w-44">
            <p className="text-5xl font-extrabold leading-none text-brand-900 tabular-nums">{formatAverage(rating.average)}</p>
            <Stars value={rating.average} size="size-5" className="mt-2.5" />
            <p className="mt-1.5 text-sm text-ink-muted">{t('rating.count', { count: rating.count })}</p>
          </div>
          <RatingDistribution distribution={rating.distribution} />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-control bg-surface-sunken px-4 py-3 text-sm text-ink-muted ring-1 ring-line">
          <Star className="size-4 shrink-0 text-line-strong" fill="currentColor" aria-hidden="true" />
          {t('rating.none')}
        </p>
      )}
    </section>
  );
}

function Reviews({ reviews }) {
  const { t, i18n } = useTranslation();
  return (
    <section className="card p-5 sm:p-6">
      <SectionTitle icon={MessageSquareQuote} className="mb-1">
        {t('expert.profile.reviewsTitle')}
      </SectionTitle>
      {/* Said out loud, so a farmer reading these knows why there are no names, and a farmer
          writing one knows the expert will not see theirs. */}
      <p className="text-xs text-ink-subtle sm:pl-[2.625rem]">{t('expert.profile.anonymous')}</p>
      {reviews?.length ? (
        <ul className="mt-4 space-y-3">
          {reviews.map((r, i) => (
            <li key={`${r.createdAt}-${i}`} className="rounded-card bg-surface-sunken p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars value={r.stars} />
                <span className="text-xs text-ink-subtle">{shortDate(r.createdAt, i18n.language)}</span>
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.comment}</p>}
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

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-7" />
      </div>
    );
  }
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
      <div>
        {back}
        {/* The profile header: the light mint panel of the design, with the person in it. */}
        <header className="animate-rise relative overflow-hidden rounded-panel bg-gradient-to-br from-brand-100 via-brand-50 to-surface px-5 py-6 ring-1 ring-brand-200/60 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-brand-200/45 blur-3xl" aria-hidden="true" />
          <Leaf
            className="pointer-events-none absolute -bottom-8 right-4 size-36 -rotate-12 fill-brand-200/40 text-brand-300/50 max-sm:hidden"
            strokeWidth={0.75}
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <span className="grid size-20 shrink-0 place-items-center rounded-full bg-surface text-brand-700 shadow-[var(--shadow-md)] ring-4 ring-brand-100">
              <UserCheck className="size-9" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{t('expert.profile.eyebrow')}</p>
              <h1 className="mt-1.5 text-[1.75rem] font-extrabold leading-[1.15] text-brand-900 sm:text-[2.125rem]">{expert.name}</h1>
              {expert.verified && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="chip bg-ok-bg text-ok ring-1 ring-ok/15">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t('expert.verified')}
                  </span>
                  {expert.verifiedSince && (
                    <span className="text-xs text-ink-muted">{t('expert.verifiedSince', { date: shortDate(expert.verifiedSince, i18n.language) })}</span>
                  )}
                </p>
              )}
              {expert.qualification && <p className="mt-3 text-lg font-bold leading-snug text-brand-700">{expert.qualification}</p>}
              {(expert.designation || expert.organisation) && (
                <p className="mt-0.5 text-sm text-ink-muted">{[expert.designation, expert.organisation].filter(Boolean).join(' · ')}</p>
              )}
              <p className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                {t('expert.profile.checkedNote')}
              </p>
            </div>
          </div>
        </header>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionTitle icon={ClipboardList}>{t('consult.expertCredentials')}</SectionTitle>
        <ExpertFacts expert={expert} fields={FACT_FIELDS} variant="tiles" />
        {expert.bio && (
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('expert.field.bio')}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">{expert.bio}</p>
          </div>
        )}
      </section>

      <RatingPanel rating={expert.rating} />
      {expert.rating?.count > 0 && <Reviews reviews={expert.reviews} />}
    </div>
  );
}
