import { ArrowLeft, CheckCircle2, MapPin, MessageSquare, Navigation, Pencil, Phone, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { describeError } from '../api/client.js';
import { useConsultation, useConsultationAction, useRateConsultation } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BookingForm, CaseSummary, ChatThread, ConsultationOffer, ExpertCard, MODE_ICONS } from '../components/consultation.jsx';
import { StarInput, Stars } from '../components/ratings.jsx';
import { Alert, ErrorState, Field, PageHeader, Spinner } from '../components/ui.jsx';
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
    <section className={`card flex flex-wrap items-center gap-4 p-5 ${live ? 'border-ok/40 bg-ok-bg/30' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold">
          {live && <span className="size-2 animate-pulse rounded-full bg-ok" aria-hidden="true" />}
          {live ? t('consult.liveNow') : t('consult.startsAt', { time: new Date(consultation.scheduledFor).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }) })}
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">{t(`consult.joinHint.${consultation.mode}`)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={consultation.mode === 'chat' ? 'btn-primary' : 'btn-secondary'} onClick={joinThread}>
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
            className="btn-secondary"
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
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold">{t('consult.expertActions')}</h2>
      {consultation.status === 'open' && (
        <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ action: 'accept' })}>
          {t('consult.accept')}
        </button>
      )}
      <Field label={t('consult.correctDisease')} htmlFor="c-disease" optional hint={t('consult.correctDiseaseHint')}>
        <input id="c-disease" className="input" value={diseaseKey} onChange={(e) => setDiseaseKey(e.target.value)} />
      </Field>
      <Field label={t('consult.advice')} htmlFor="c-advice">
        <textarea id="c-advice" className="input" rows={3} value={advice} onChange={(e) => setAdvice(e.target.value)} maxLength={2000} />
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
      <section className="card p-5">
        <h2 className="font-bold">{t('rating.rateTitle')}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars value={saved.stars} size="size-5" />
          <p className="font-semibold">{t('rating.youRated', { stars: saved.stars })}</p>
        </div>
        {saved.comment && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{saved.comment}</p>}
        <p className="mt-3 text-xs text-ink-subtle">{t('rating.rateBody')}</p>
        <button
          type="button"
          className="btn-secondary mt-3"
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
    <form className="card space-y-4 p-5" onSubmit={submit}>
      <div>
        <h2 className="font-bold">{t('rating.rateTitle')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('rating.rateBody')}</p>
      </div>
      <StarInput value={stars} onChange={setStars} legend={t('rating.starsLabel')} error={error?.fields?.stars} />
      <Field label={t('rating.comment')} htmlFor="r-comment" optional hint={t('rating.commentHint')} error={error?.fields?.comment}>
        <textarea
          id="r-comment"
          className="input py-2"
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

  if (isLoading) return <Spinner />;
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
        <section className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Icon className="size-5 text-brand-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t(`consult.booked.${consultation.mode}`)}</p>
              <p className="text-sm text-ink-muted">
                {shortDate(consultation.scheduledFor, i18n.language)} ·{' '}
                {new Date(consultation.scheduledFor).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {consultation.expert?.name ? ` · ${consultation.expert.name}` : ` · ${t('consult.awaitingExpert')}`}
              </p>
              {consultation.mode === 'call' && consultation.contactPhone && (
                <p className="mt-1 flex items-center gap-1.5 text-sm">
                  <Phone className="size-3.5" aria-hidden="true" />
                  {consultation.contactPhone}
                </p>
              )}
              {consultation.mode === 'visit' && consultation.visitAddress && (
                <p className="mt-1 flex items-start gap-1.5 text-sm">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {consultation.visitAddress}
                </p>
              )}
            </div>
            <span className="chip border border-line px-2.5 py-1 text-xs font-semibold">{t(`consult.status.${consultation.status}`)}</span>
          </div>

          {mine && !closed && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRescheduling((v) => !v)}>
                {t('consult.reschedule')}
              </button>
              <button
                type="button"
                className="btn-ghost text-danger"
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
        <section className="card p-5">
          <h2 className="mb-3 font-bold">{t('consult.expertCredentials')}</h2>
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
        <Alert tone="ok">
          <p className="font-semibold">{t('consult.expertAnswer')}</p>
          <p className="whitespace-pre-wrap font-normal">{consultation.outcome.advice}</p>
        </Alert>
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
            className="btn-ghost mt-2 -ml-3 text-danger"
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
