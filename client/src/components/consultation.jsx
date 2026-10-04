import { CalendarClock, MapPin, MessageSquare, Phone, Send, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultationDecision, useConsultationMessage, useConsultationSlots } from '../api/hooks.js';
import { shortDate } from '../lib/format.js';
import { Alert, Field, Spinner } from './ui.jsx';

export const MODE_ICONS = { call: Phone, chat: MessageSquare, visit: MapPin };

const dayKey = (iso) => iso.slice(0, 10);

function formatSlot(iso, lang) {
  return new Date(iso).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' });
}

/**
 * The yes/no question. Shown whenever the app has flagged a case it should not settle alone:
 * an uncertain diagnosis, or a treatment that is not working.
 *
 * Saying no is a real answer with a real consequence, so the deadline is stated here rather
 * than buried: an unbooked case and its photo are deleted when the week runs out.
 */
export function ConsultationOffer({ consultation }) {
  const { t, i18n } = useTranslation();
  const [choosing, setChoosing] = useState(false);
  const decide = useConsultationDecision(consultation.id);

  if (consultation.decision === 'scheduled') return <ScheduledCard consultation={consultation} />;

  const deadline = consultation.expiresAt ? shortDate(consultation.expiresAt, i18n.language) : null;

  if (consultation.decision === 'declined') {
    return (
      <Alert tone="info">
        <p className="font-semibold">{t('consult.declinedTitle')}</p>
        <p className="font-normal">{deadline ? t('consult.declinedBody', { date: deadline }) : null}</p>
        <button type="button" className="btn-secondary mt-3" onClick={() => setChoosing(true)}>
          {t('consult.changeMind')}
        </button>
        {choosing && <BookingForm consultation={consultation} onDone={() => setChoosing(false)} />}
      </Alert>
    );
  }

  return (
    <section className="card border-info/40 bg-info-bg/40 p-5">
      <div className="flex items-start gap-3">
        <UserCheck className="mt-0.5 size-5 shrink-0 text-info" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('consult.offerTitle')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t(`consult.reason.${consultation.trigger}`)} {t('consult.offerBody')}
          </p>
          {deadline && <p className="mt-2 text-sm font-medium text-warn">{t('consult.retentionNotice', { date: deadline })}</p>}

          {!choosing ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => setChoosing(true)}>
                {t('consult.yes')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ decision: 'declined' })}
              >
                {t('consult.no')}
              </button>
            </div>
          ) : (
            <BookingForm consultation={consultation} onDone={() => setChoosing(false)} />
          )}
        </div>
      </div>
    </section>
  );
}

/** Pick how to meet the expert, and when. */
export function BookingForm({ consultation, onDone }) {
  const { t, i18n } = useTranslation();
  const { data: slots = [], isLoading } = useConsultationSlots();
  const decide = useConsultationDecision(consultation.id);

  const [mode, setMode] = useState('chat');
  const [slot, setSlot] = useState('');
  const [contactPhone, setPhone] = useState('');
  const [visitAddress, setAddress] = useState('');
  const [question, setQuestion] = useState('');

  const days = [...new Set(slots.map(dayKey))];
  const error = decide.error?.response?.data?.error;

  const submit = (e) => {
    e.preventDefault();
    decide.mutate(
      {
        decision: 'scheduled',
        mode,
        scheduledFor: slot,
        ...(mode === 'call' && { contactPhone }),
        ...(mode === 'visit' && { visitAddress }),
        ...(question.trim() && { question: question.trim() }),
      },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <form className="mt-4 space-y-4" onSubmit={submit}>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t('consult.howTitle')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {['chat', 'call', 'visit'].map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <label
                key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${
                  mode === m ? 'border-brand-700 bg-brand-50 font-semibold' : 'border-line'
                }`}
              >
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  {t(`consult.mode.${m}`)}
                  <span className="block text-xs font-normal text-ink-muted">{t(`consult.modeHint.${m}`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {mode === 'call' && (
        <Field label={t('consult.phone')} htmlFor="c-phone" error={error?.fields?.contactPhone}>
          <input id="c-phone" className="input" type="tel" value={contactPhone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
      )}
      {mode === 'visit' && (
        <Field label={t('consult.address')} htmlFor="c-addr" error={error?.fields?.visitAddress}>
          <textarea id="c-addr" className="input" rows={2} value={visitAddress} onChange={(e) => setAddress(e.target.value)} required />
        </Field>
      )}

      <Field label={t('consult.when')} htmlFor="c-slot" error={error?.fields?.scheduledFor}>
        {isLoading ? (
          <Spinner />
        ) : (
          <select id="c-slot" className="input" value={slot} onChange={(e) => setSlot(e.target.value)} required>
            <option value="" disabled>
              {t('consult.pickSlot')}
            </option>
            {days.map((day) => (
              <optgroup key={day} label={shortDate(day, i18n.language)}>
                {slots
                  .filter((s) => dayKey(s) === day)
                  .map((s) => (
                    <option key={s} value={s}>
                      {formatSlot(s, i18n.language)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        )}
      </Field>

      <Field label={t('consult.question')} htmlFor="c-q" optional hint={t('consult.questionHint')}>
        <textarea id="c-q" className="input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} />
      </Field>

      {error && !error.fields && <Alert tone="danger">{error.message}</Alert>}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={decide.isPending || !slot}>
          {decide.isPending ? <Spinner /> : <CalendarClock className="size-4" aria-hidden="true" />}
          {t('consult.confirm')}
        </button>
        <button type="button" className="btn-ghost" onClick={() => onDone?.()}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

export function ScheduledCard({ consultation }) {
  const { t, i18n } = useTranslation();
  const Icon = MODE_ICONS[consultation.mode] ?? CalendarClock;
  return (
    <section className="card border-ok/40 bg-ok-bg/40 p-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t(`consult.booked.${consultation.mode}`)}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {shortDate(consultation.scheduledFor, i18n.language)} ·{' '}
            {formatSlot(consultation.scheduledFor, i18n.language)}
            {consultation.expert?.name ? ` · ${consultation.expert.name}` : ` · ${t('consult.awaitingExpert')}`}
          </p>
          <Link to={`/consultations/${consultation.id}`} className="btn-secondary mt-3">
            {t('consult.open')}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The case as the app recorded it, so neither side has to retell it. */
export function CaseSummary({ consultation }) {
  const { t, i18n } = useTranslation();
  const s = consultation.caseSummary ?? {};
  const rows = [
    [t('scan.crop'), s.crop],
    [t('consult.bestGuess'), s.diseaseName && `${s.diseaseName}${s.confidence != null ? ` · ${Math.round(s.confidence * 100)}%` : ''}`],
    [t('progression.severity'), s.severityPercent != null ? `${s.severityPercent}%` : null],
    [t('consult.trend'), s.severityTrend && t(`progression.trend.${s.severityTrend}`, { defaultValue: s.severityTrend })],
    [t('consult.treatment'), s.treatmentProduct],
    [
      t('consult.beforeAfter'),
      s.severityBefore != null && s.severityAfter != null ? `${s.severityBefore}% → ${s.severityAfter}%` : null,
    ],
  ].filter(([, value]) => value);

  return (
    <section className="card p-5">
      <h2 className="mb-3 font-semibold">{t('consult.caseTitle')}</h2>
      <div className="flex gap-4">
        {s.imageUrl && <img src={s.imageUrl} alt="" className="size-28 shrink-0 rounded-xl border border-line object-cover" />}
        <dl className="min-w-0 flex-1 space-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">{t('consult.raised')}</dt>
            <dd className="text-right">{shortDate(consultation.createdAt, i18n.language)}</dd>
          </div>
        </dl>
      </div>
      {consultation.scan?.id && (
        <Link to={`/scans/${consultation.scan.id}`} className="btn-ghost mt-3 -ml-3">
          {t('consult.viewScan')}
        </Link>
      )}
    </section>
  );
}

export function ChatThread({ consultation, meId }) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState('');
  const send = useConsultationMessage(consultation.id);
  const closed = ['completed', 'cancelled'].includes(consultation.status);

  const submit = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    send.mutate({ body: body.trim() }, { onSuccess: () => setBody('') });
  };

  return (
    <section className="card p-5">
      <h2 className="mb-3 font-semibold">{t('consult.chatTitle')}</h2>
      <ol className="space-y-3">
        {consultation.messages?.map((m) => {
          const mine = String(m.sender?.id ?? m.sender) === String(meId);
          return (
            <li key={m.id ?? m.sentAt} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? 'bg-brand-700 text-white' : 'bg-surface border border-line'}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                <p className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                  {t(`consult.role.${m.senderRole}`)} · {shortDate(m.sentAt, i18n.language)}
                </p>
              </div>
            </li>
          );
        })}
        {!consultation.messages?.length && <li className="text-sm text-ink-muted">{t('consult.chatEmpty')}</li>}
      </ol>

      {!closed && (
        <form className="mt-4 flex gap-2" onSubmit={submit}>
          <input
            className="input flex-1"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('consult.chatPlaceholder')}
            maxLength={2000}
            aria-label={t('consult.chatTitle')}
          />
          <button type="submit" className="btn-primary" disabled={send.isPending || !body.trim()}>
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">{t('consult.send')}</span>
          </button>
        </form>
      )}
    </section>
  );
}
