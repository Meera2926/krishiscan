import clsx from 'clsx';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  Pencil,
  Phone,
  Send,
  ShieldCheck,
  Star,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { describeError } from '../api/client.js';
import { useConsultation, useConsultationAction, useRateConsultation } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  BookingForm,
  CaseSummary,
  ChatThread,
  ConsultationOffer,
  ConsultationStatusChip,
  ExpertCard,
  MODE_ICONS,
} from '../components/consultation.jsx';
import { StarInput, Stars } from '../components/ratings.jsx';
import { Alert, ErrorState, Field, FullPageSpinner, IconBadge, PageHeader, SectionTitle, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

/**
 * How each side actually joins the appointment. There is no telephony or video in the app, so
 * this is honest about what it does: it opens the thread, hands the expert a number to dial, or
 * hands either side directions. "Live" means the booked hour is running.
 */
function SessionBar({ consultation, mine, canAdvise }) {
  const { t, i18n } = useTranslation();
  if (consultation.decision !== 'scheduled' || ['completed', 'cancelled'].includes(consultation.status)) return null;

  const start = new Date(consultation.scheduledFor).getTime();
  const live = Date.now() >= start - 5 * 60_000 && Date.now() <= start + 60 * 60_000;
  const joinThread = () => document.getElementById('thread')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className={clsx('flex flex-wrap items-center gap-4 p-5', live ? 'rounded-card bg-ok-bg/70 ring-1 ring-ok/20' : 'card')}>
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3.5">
        <span className="relative">
          <IconBadge icon={Clock} tone={live ? 'white' : 'accent'} size="lg" />
          {live && (
            <span className="absolute right-0 top-0 size-3 animate-pulse rounded-full bg-ok ring-2 ring-surface" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-bold text-brand-900">
            {live ? t('consult.liveNow') : t('consult.startsAt', { time: new Date(consultation.scheduledFor).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }) })}
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{t(`consult.joinHint.${consultation.mode}`)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={consultation.mode === 'chat' ? 'btn-primary' : 'btn-outline'} onClick={joinThread}>
          <MessageSquare className="size-4" aria-hidden="true" />
          {consultation.mode === 'chat' ? t('consult.joinChat') : t('consult.openMessages')}
        </button>

        {consultation.mode === 'call' && consultation.contactPhone && (mine || canAdvise) && (
          <a
            href={`tel:${consultation.contactPhone.replace(/\s+/g, '')}`}
            className="btn-primary"
            // The farmer gave this number so the expert could ring it; only the expert dials.
            aria-disabled={mine}
            onClick={(e) => mine && e.preventDefault()}
          >
            <Phone className="size-4" aria-hidden="true" />
            {mine ? consultation.contactPhone : t('consult.callFarmer')}
          </a>
        )}

        {consultation.mode === 'visit' && consultation.visitAddress && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consultation.visitAddress)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-outline"
          >
            <Navigation className="size-4" aria-hidden="true" />
            {t('consult.directions')}
          </a>
        )}

        {canAdvise && !mine && !consultation.expert && <AcceptButton consultation={consultation} />}
      </div>
    </section>
  );
}

function AcceptButton({ consultation }) {
  const { t } = useTranslation();
  const act = useConsultationAction(consultation.id);
  return (
    <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ action: 'accept' })}>
      <CheckCircle2 className="size-4" aria-hidden="true" />
      {t('consult.accept')}
    </button>
  );
}

/** What the expert does with a booked case: take it, then close it with an answer. */
function ExpertActions({ consultation }) {
  const { t } = useTranslation();
  const act = useConsultationAction(consultation.id);
  const [advice, setAdvice] = useState('');
  const [diseaseKey, setDiseaseKey] = useState(consultation.caseSummary?.diseaseKey ?? '');

  return (
    <section className="card space-y-5 p-5 sm:p-6">
      <SectionTitle icon={ClipboardCheck} className="mb-0">
        {t('consult.expertActions')}
      </SectionTitle>
      {consultation.status === 'open' && (
        <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ action: 'accept' })}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t('consult.accept')}
        </button>
      )}
      <Field label={t('consult.correctDisease')} htmlFor="c-disease" optional hint={t('consult.correctDiseaseHint')}>
        <input id="c-disease" className="input" value={diseaseKey} onChange={(e) => setDiseaseKey(e.target.value)} />
      </Field>
      <Field label={t('consult.advice')} htmlFor="c-advice">
        <textarea id="c-advice" className="input py-2.5" rows={4} value={advice} onChange={(e) => setAdvice(e.target.value)} maxLength={2000} />
      </Field>
      <button
        type="button"
        className="btn-primary"
        disabled={act.isPending || !advice.trim()}
        onClick={() => act.mutate({ action: 'complete', advice: advice.trim(), ...(diseaseKey.trim() && { diseaseKey: diseaseKey.trim() }) })}
      >
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {t('consult.complete')}
      </button>
      {act.error && <Alert tone="danger">{act.error.response?.data?.error?.message ?? act.error.message}</Alert>}
    </section>
  );
}

/**
 * The farmer's verdict on the advice. Only the farmer whose case it was can give one, and only once
 * it is answered, so every rating comes from someone the expert actually advised.
 */
function RateExpert({ consultation }) {
  const { t } = useTranslation();
  const rate = useRateConsultation(consultation.id);
  const saved = consultation.rating;
  const [editing, setEditing] = useState(!saved);
  const [stars, setStars] = useState(saved?.stars ?? 0);
  const [comment, setComment] = useState(saved?.comment ?? '');
  const error = rate.error ? describeError(rate.error) : null;

  if (saved && !editing) {
    return (
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={Star} tone="accent">
          {t('rating.rateTitle')}
        </SectionTitle>
        <div className="rounded-card bg-accent-50 p-4 ring-1 ring-accent-500/20">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars value={saved.stars} size="size-5" />
            <p className="font-semibold text-ink">{t('rating.youRated', { stars: saved.stars })}</p>
          </div>
          {saved.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{saved.comment}</p>}
        </div>
        <p className="mt-3 text-xs text-ink-subtle">{t('rating.rateBody')}</p>
        <button
          type="button"
          className="btn-outline mt-4"
          onClick={() => {
            setStars(saved.stars);
            setComment(saved.comment ?? '');
            rate.reset();
            setEditing(true);
          }}
        >
          <Pencil className="size-4" aria-hidden="true" />
          {t('rating.edit')}
        </button>
      </section>
    );
  }

  const submit = (e) => {
    e.preventDefault();
    if (!stars) return;
    const text = comment.trim();
    // An empty comment is sent only to clear one given before; otherwise it is left out.
    rate.mutate({ stars, ...((text || saved?.comment) && { comment: text }) }, { onSuccess: () => setEditing(false) });
  };

  return (
    <form className="card space-y-5 p-5 sm:p-6" onSubmit={submit}>
      <div>
        <SectionTitle icon={Star} tone="accent" className="mb-1.5">
          {t('rating.rateTitle')}
        </SectionTitle>
        <p className="text-sm text-ink-muted">{t('rating.rateBody')}</p>
      </div>
      <StarInput value={stars} onChange={setStars} legend={t('rating.starsLabel')} error={error?.fields?.stars} />
      <Field label={t('rating.comment')} htmlFor="r-comment" optional hint={t('rating.commentHint')} error={error?.fields?.comment}>
        <textarea
          id="r-comment"
          className="input py-2.5"
          rows={3}
          maxLength={500}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('rating.commentPlaceholder')}
        />
      </Field>
      {error && !Object.keys(error.fields).length && <Alert tone="danger">{error.message}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={!stars || rate.isPending}>
          {rate.isPending ? <Spinner className="size-4 text-white" /> : <Send className="size-4" aria-hidden="true" />}
          {saved ? t('rating.update') : t('rating.submit')}
        </button>
        {saved && (
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}

export default function ConsultationDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: consultation, isLoading, error, refetch } = useConsultation(id);
  const act = useConsultationAction(id);
  const [rescheduling, setRescheduling] = useState(false);

  if (isLoading) return <FullPageSpinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!consultation) return null;

  // Admins can look and cancel, but advice only comes from a verified expert; an unverified one
  // never reaches this page.
  const canAdvise = user?.role === 'expert';
  const mine = String(consultation.farmer?.id ?? consultation.farmer) === String(user?.id);
  const Icon = MODE_ICONS[consultation.mode] ?? CheckCircle2;
  const closed = ['completed', 'cancelled'].includes(consultation.status);
  const heldBy = consultation.expert ? String(consultation.expert.id ?? consultation.expert) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t('consult.detailTitle')}
        subtitle={t(`consult.reason.${consultation.trigger}`)}
        back={
          <Link to="/consultations" className="btn-ghost -ml-3 mb-2">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('consult.pageTitle')}
          </Link>
        }
      />

      {consultation.decision === 'scheduled' ? (
        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-3.5 sm:gap-4">
            <IconBadge icon={Icon} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-brand-900">{t(`consult.booked.${consultation.mode}`)}</p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
                  <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                  <span className="min-w-0">
                    {shortDate(consultation.scheduledFor, i18n.language)} ·{' '}
                    {new Date(consultation.scheduledFor).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {consultation.expert?.name ? ` · ${consultation.expert.name}` : ` · ${t('consult.awaitingExpert')}`}
                  </span>
                </p>
                {consultation.mode === 'call' && consultation.contactPhone && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    <Phone className="size-3.5 text-brand-600" aria-hidden="true" />
                    {consultation.contactPhone}
                  </p>
                )}
                {consultation.mode === 'visit' && consultation.visitAddress && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-medium">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                    {consultation.visitAddress}
                  </p>
                )}
              </div>
              <ConsultationStatusChip consultation={consultation} />
            </div>
          </div>

          {mine && !closed && (
            <div className="mt-5 flex flex-wrap gap-2.5 border-t border-line pt-5">
              <button type="button" className="btn-outline" onClick={() => setRescheduling((v) => !v)}>
                <CalendarClock className="size-4" aria-hidden="true" />
                {t('consult.reschedule')}
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={act.isPending}
                onClick={() => {
                  if (window.confirm(t('consult.cancelConfirm'))) {
                    act.mutate({ action: 'cancel' }, { onSuccess: () => navigate('/consultations') });
                  }
                }}
              >
                <XCircle className="size-4" aria-hidden="true" />
                {t('consult.cancelBooking')}
              </button>
            </div>
          )}
          {rescheduling && <BookingForm consultation={consultation} onDone={() => setRescheduling(false)} />}
        </section>
      ) : mine ? (
        // The dashboard sends the farmer here to answer the offer, so it has to be answerable here,
        // not only from the scan it was raised on. The offer states the deletion date itself.
        <ConsultationOffer consultation={consultation} />
      ) : (
        <Alert tone="warn">
          <p className="font-semibold">{t('consult.notBookedTitle')}</p>
          {consultation.expiresAt && (
            <p className="font-normal">{t('consult.retentionNotice', { date: shortDate(consultation.expiresAt, i18n.language) })}</p>
          )}
        </Alert>
      )}

      <SessionBar consultation={consultation} mine={mine} canAdvise={canAdvise} />

      {consultation.expert && (
        <section className="card p-5 sm:p-6">
          <SectionTitle icon={ShieldCheck}>{t('consult.expertCredentials')}</SectionTitle>
          <ExpertCard
            expert={{
              ...consultation.expert.expertProfile,
              id: consultation.expert.id,
              name: consultation.expert.name,
              state: consultation.expert.state,
              district: consultation.expert.district,
              verified: consultation.expert.verified ?? consultation.expert.expertVerification?.status === 'verified',
            }}
            rating={consultation.expertRating}
          />
        </section>
      )}

      <CaseSummary consultation={consultation} />

      {consultation.outcome?.advice && (
        <section className="relative overflow-hidden rounded-card bg-ok-bg/70 p-5 ring-1 ring-ok/20 sm:p-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-ok" aria-hidden="true" />
          <div className="flex items-start gap-3.5">
            <IconBadge icon={CheckCircle2} tone="white" size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-brand-900">{t('consult.expertAnswer')}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{consultation.outcome.advice}</p>
            </div>
          </div>
        </section>
      )}

      {/* Same rule as the server: the farmer, once the advice was given, even if cancelled after. */}
      {mine && user?.role === 'farmer' && consultation.outcome?.completedAt && consultation.expert && (
        <RateExpert consultation={consultation} />
      )}

      {consultation.decision === 'scheduled' && <ChatThread consultation={consultation} meId={user?.id} id="thread" readOnly={user?.role === 'admin'} />}

      {/* Only on a live case that is unclaimed or already this expert's: the server refuses the rest. */}
      {canAdvise && !mine && consultation.decision === 'scheduled' && !closed && (!heldBy || heldBy === String(user?.id)) && (
        <ExpertActions consultation={consultation} />
      )}
      {user?.role === 'admin' && consultation.decision === 'scheduled' && !closed && (
        <Alert tone="info">
          <p className="font-normal">{t('consult.adminReadOnly')}</p>
          <button
            type="button"
            className="btn-danger mt-3"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t('consult.cancelConfirm'))) act.mutate({ action: 'cancel' });
            }}
          >
            <XCircle className="size-4" aria-hidden="true" />
            {t('consult.cancelBooking')}
          </button>
        </Alert>
      )}
    </div>
  );
}
