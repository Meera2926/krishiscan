import { ArrowLeft, CheckCircle2, MapPin, Phone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useConsultation, useConsultationAction } from '../api/hooks.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BookingForm, CaseSummary, ChatThread, MODE_ICONS } from '../components/consultation.jsx';
import { Alert, ErrorState, Field, PageHeader, Spinner } from '../components/ui.jsx';
import { shortDate } from '../lib/format.js';

/** What the expert does with a booked case: take it, then close it with an answer. */
function ExpertActions({ consultation }) {
  const { t } = useTranslation();
  const act = useConsultationAction(consultation.id);
  const [advice, setAdvice] = useState('');
  const [diseaseKey, setDiseaseKey] = useState(consultation.caseSummary?.diseaseKey ?? '');

  if (consultation.status === 'completed') return null;

  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold">{t('consult.expertActions')}</h2>
      {!consultation.expert && (
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

  const isExpert = ['expert', 'admin'].includes(user?.role);
  const mine = String(consultation.farmer?.id ?? consultation.farmer) === String(user?.id);
  const Icon = MODE_ICONS[consultation.mode] ?? CheckCircle2;
  const closed = ['completed', 'cancelled'].includes(consultation.status);

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
      ) : (
        <Alert tone="warn">
          <p className="font-semibold">{t('consult.notBookedTitle')}</p>
          {consultation.expiresAt && (
            <p className="font-normal">{t('consult.retentionNotice', { date: shortDate(consultation.expiresAt, i18n.language) })}</p>
          )}
        </Alert>
      )}

      <CaseSummary consultation={consultation} />

      {consultation.outcome?.advice && (
        <Alert tone="ok">
          <p className="font-semibold">{t('consult.expertAnswer')}</p>
          <p className="whitespace-pre-wrap font-normal">{consultation.outcome.advice}</p>
        </Alert>
      )}

      {consultation.decision === 'scheduled' && consultation.mode === 'chat' && (
        <ChatThread consultation={consultation} meId={user?.id} />
      )}

      {isExpert && !mine && consultation.decision === 'scheduled' && <ExpertActions consultation={consultation} />}
    </div>
  );
}
