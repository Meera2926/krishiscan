import clsx from 'clsx';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  ImagePlus,
  Languages,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useConsultationDecision, useConsultationMessage, useConsultationSlots, useExperts } from '../api/hooks.js';
import { shortDate } from '../lib/format.js';
import { RatingLine } from './ratings.jsx';
import { Alert, Field, IconBadge, SectionTitle, Spinner } from './ui.jsx';

export const MODE_ICONS = { call: Phone, chat: MessageSquare, visit: MapPin };

const STATUS_TONE = {
  open: 'bg-info-bg text-info ring-info/15',
  confirmed: 'bg-ok-bg text-ok ring-ok/15',
  completed: 'bg-brand-50 text-brand-800 ring-brand-700/15',
  cancelled: 'bg-canvas-deep text-ink-muted ring-line-strong',
  expired: 'bg-warn-bg text-warn ring-warn/20',
};

/**
 * A consultation's status as a chip, for the list and the detail page. An unanswered offer is the
 * one state that asks something of the farmer, so it reads "needs your answer" in sunlight yellow.
 */
export function ConsultationStatusChip({ consultation, className }) {
  const { t } = useTranslation();
  const pending = consultation.decision === 'pending';
  return (
    <span
      className={clsx(
        'chip w-fit shrink-0 ring-1',
        pending ? 'bg-accent-100 text-accent-700 ring-accent-700/15' : STATUS_TONE[consultation.status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {pending ? t('consult.needsAnswer') : t(`consult.status.${consultation.status}`)}
    </span>
  );
}

/** A choice tile around a visually hidden radio: the ring follows keyboard focus too. */
const choiceTile = (selected) =>
  clsx(
    'relative flex cursor-pointer rounded-card border bg-surface transition-[border-color,background-color,box-shadow] duration-200',
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600',
    selected ? 'border-brand-600 bg-brand-50 shadow-[0_0_0_3px_rgb(63_140_70_/_0.15)]' : 'border-line hover:border-brand-300 hover:bg-brand-50/40',
  );

/** The round tick in the corner of the selected tile. */
function SelectedMark({ selected }) {
  return (
    <span
      className={clsx(
        'grid size-5 shrink-0 place-items-center rounded-full ring-1 transition-colors',
        selected ? 'bg-brand-700 text-white ring-brand-700' : 'bg-surface ring-line-strong',
      )}
      aria-hidden="true"
    >
      {selected && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

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
        <button type="button" className="btn-outline mt-3" onClick={() => setChoosing(true)}>
          {t('consult.changeMind')}
        </button>
        {choosing && <BookingForm consultation={consultation} onDone={() => setChoosing(false)} />}
      </Alert>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand-50 via-surface to-surface p-5 ring-1 ring-brand-200/70 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand-100/70 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-start gap-4">
        <IconBadge icon={UserCheck} size="lg" className="max-sm:hidden" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2.5 text-lg font-bold leading-snug text-brand-900">
            <IconBadge icon={UserCheck} size="sm" className="sm:hidden" />
            {t('consult.offerTitle')}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {t(`consult.reason.${consultation.trigger}`)} {t('consult.offerBody')}
          </p>
          {deadline && (
            <p className="mt-3 flex items-start gap-2 rounded-control bg-warn-bg/70 px-3 py-2 text-sm font-medium text-warn ring-1 ring-warn/15">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('consult.retentionNotice', { date: deadline })}
            </p>
          )}

          {!choosing ? (
            <div className="mt-5 flex flex-wrap gap-2.5">
              <button type="button" className="btn-primary" onClick={() => setChoosing(true)}>
                <CalendarClock className="size-4" aria-hidden="true" />
                {t('consult.yes')}
              </button>
              <button
                type="button"
                className="btn-outline"
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

/**
 * What a farmer needs to choose an adviser: what they are qualified in, where they studied and
 * work, how long they have been doing it and what other farmers thought. A name alone is not a
 * basis for trusting crop advice.
 *
 * The tick means an admin has checked this person's degree certificate, so it shows only when
 * the server says so. A qualification line on its own is just something the expert typed in.
 *
 * `rating` overrides `expert.rating` for callers that get the average separately. `newTab` is for
 * the booking picker: the farmer is halfway through a form and should not lose it to read a profile.
 */
export function ExpertCard({ expert, rating, compact = false, profileLink = true, newTab = false }) {
  const { t } = useTranslation();
  if (!expert) return null;
  const place = [expert.district, expert.state].filter(Boolean).join(', ');
  const studied = [expert.university, expert.graduationYear].filter(Boolean).join(', ');
  const score = rating ?? expert.rating;

  return (
    <div className={compact ? 'flex gap-3' : 'flex gap-3.5 sm:gap-4'}>
      <IconBadge icon={UserCheck} size={compact ? 'md' : 'lg'} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold leading-tight text-brand-900">
          {expert.name}
          {expert.verified === true && (
            <span className="chip bg-ok-bg text-ok ring-1 ring-ok/15">
              <BadgeCheck className="size-3.5 shrink-0" aria-hidden="true" />
              {t('expert.verified')}
            </span>
          )}
        </p>
        {expert.qualification && <p className="mt-1 text-sm font-semibold text-brand-700">{expert.qualification}</p>}
        {studied && (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-ink-muted">
            <GraduationCap className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {studied}
          </p>
        )}
        {(expert.designation || expert.organisation) && (
          <p className="mt-0.5 text-sm text-ink-muted">{[expert.designation, expert.organisation].filter(Boolean).join(' · ')}</p>
        )}
        <RatingLine rating={score} className="mt-1.5" />
        {!compact && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            {expert.experienceYears != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 ring-1 ring-line">
                <Award className="size-3.5 text-brand-600" aria-hidden="true" />
                {t('consult.yearsExperience', { count: expert.experienceYears })}
              </span>
            )}
            {place && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 ring-1 ring-line">
                <MapPin className="size-3.5 text-brand-600" aria-hidden="true" />
                {place}
              </span>
            )}
            {expert.languages?.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 ring-1 ring-line">
                <Languages className="size-3.5 text-brand-600" aria-hidden="true" />
                {expert.languages.map((l) => t(`lang.${l}`, l)).join(', ')}
              </span>
            )}
          </div>
        )}
        {!compact && expert.bio && <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{expert.bio}</p>}
        {profileLink && expert.id && (
          <Link
            to={`/experts/${expert.id}`}
            className="group mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-bold text-brand-700 underline-offset-2 hover:underline"
            {...(newTab && { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {t('expert.viewProfile')}
            {newTab ? (
              <>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                <span className="sr-only">({t('expert.opensNewTab')})</span>
              </>
            ) : (
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            )}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Choose a named adviser, or leave it to whoever is free. */
function ExpertPicker({ crop, mode, value, onChange }) {
  const { t } = useTranslation();
  const { data: experts = [], isLoading } = useExperts({ ...(crop && { crop }), ...(mode && { mode }) });
  if (isLoading) return <Spinner />;
  if (!experts.length) return null;

  const options = [{ id: '', name: t('consult.anyExpert'), any: true }, ...experts];
  return (
    <fieldset>
      <legend className="label">{t('consult.chooseExpert')}</legend>
      <div className="space-y-2.5">
        {options.map((e) => (
          <label key={e.id || 'any'} className={clsx(choiceTile(value === e.id), 'gap-3 p-3.5 sm:p-4')}>
            <input
              type="radio"
              name="expert"
              value={e.id}
              checked={value === e.id}
              onChange={() => onChange(e.id)}
              className="sr-only"
            />
            {e.any ? (
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <IconBadge icon={Users} tone="accent" />
                <span className="min-w-0">
                  <span className="block font-bold text-brand-900">{e.name}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{t('consult.anyExpertHint')}</span>
                </span>
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <ExpertCard expert={e} newTab />
              </span>
            )}
            <SelectedMark selected={value === e.id} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pick how to meet the expert, and when. */
export function BookingForm({ consultation, onDone }) {
  const { t, i18n } = useTranslation();
  const { data: slots = [], isLoading } = useConsultationSlots();
  const decide = useConsultationDecision(consultation.id);

  const [mode, setMode] = useState('chat');
  const [expertId, setExpertId] = useState('');
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
        ...(expertId && { expertId }),
        ...(question.trim() && { question: question.trim() }),
      },
      { onSuccess: () => onDone?.() },
    );
  };

  return (
    <form className="mt-5 space-y-5 border-t border-line pt-5" onSubmit={submit}>
      <fieldset>
        <legend className="label">{t('consult.howTitle')}</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {['chat', 'call', 'visit'].map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <label key={m} className={clsx(choiceTile(mode === m), 'items-center gap-3 p-3 text-sm')}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                <IconBadge icon={Icon} tone={mode === m ? 'white' : 'brand'} />
                <span className="min-w-0 flex-1 font-semibold text-ink">
                  {t(`consult.mode.${m}`)}
                  <span className="block text-xs font-normal text-ink-muted">{t(`consult.modeHint.${m}`)}</span>
                </span>
                <SelectedMark selected={mode === m} />
              </label>
            );
          })}
        </div>
      </fieldset>

      <ExpertPicker crop={consultation.caseSummary?.crop} mode={mode} value={expertId} onChange={setExpertId} />

      {mode === 'call' && (
        <Field label={t('consult.phone')} htmlFor="c-phone" error={error?.fields?.contactPhone}>
          <input id="c-phone" className="input" type="tel" value={contactPhone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>
      )}
      {mode === 'visit' && (
        <Field label={t('consult.address')} htmlFor="c-addr" error={error?.fields?.visitAddress}>
          <textarea id="c-addr" className="input py-2.5" rows={2} value={visitAddress} onChange={(e) => setAddress(e.target.value)} required />
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
        <textarea id="c-q" className="input py-2.5" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} />
      </Field>

      {error && !error.fields && <Alert tone="danger">{error.message}</Alert>}

      <div className="flex flex-wrap gap-2.5">
        <button type="submit" className="btn-primary" disabled={decide.isPending || !slot}>
          {decide.isPending ? <Spinner className="size-4 text-white" /> : <CalendarClock className="size-4" aria-hidden="true" />}
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
    <section className="rounded-card bg-ok-bg/60 p-5 ring-1 ring-ok/15">
      <div className="flex items-start gap-3.5">
        <IconBadge icon={Icon} tone="white" size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-snug text-brand-900">{t(`consult.booked.${consultation.mode}`)}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {shortDate(consultation.scheduledFor, i18n.language)} ·{' '}
            {formatSlot(consultation.scheduledFor, i18n.language)}
            {consultation.expert?.name ? ` · ${consultation.expert.name}` : ` · ${t('consult.awaitingExpert')}`}
          </p>
          {consultation.expert?.expertProfile?.qualification && (
            <p className="mt-0.5 text-sm font-semibold text-brand-700">{consultation.expert.expertProfile.qualification}</p>
          )}
          {consultation.expert && <RatingLine rating={consultation.expertRating} className="mt-1" />}
          <Link to={`/consultations/${consultation.id}`} className="btn-outline mt-4">
            {t('consult.open')}
            <ArrowRight className="size-4" aria-hidden="true" />
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
    <section className="card p-5 sm:p-6">
      <SectionTitle icon={FileText}>{t('consult.caseTitle')}</SectionTitle>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {s.imageUrl && (
          <img
            src={s.imageUrl}
            alt=""
            className="h-44 w-full shrink-0 rounded-card object-cover ring-1 ring-line sm:size-36"
          />
        )}
        <dl className="min-w-0 flex-1 divide-y divide-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="text-right font-semibold text-ink">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <dt className="text-ink-muted">{t('consult.raised')}</dt>
            <dd className="text-right">{shortDate(consultation.createdAt, i18n.language)}</dd>
          </div>
        </dl>
      </div>
      {consultation.scan?.id && (
        <Link to={`/scans/${consultation.scan.id}`} className="btn-ghost group mt-3 -ml-3 text-brand-700">
          {t('consult.viewScan')}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

/**
 * The thread both sides write in. Shown for every mode, not only live chat: a call still needs
 * somewhere to leave the advice afterwards, and a visit needs somewhere to agree directions.
 * `readOnly` is for an admin: they can read the thread but only the farmer and the expert write in it.
 */
export function ChatThread({ consultation, meId, id, readOnly = false }) {
  const { t, i18n } = useTranslation();
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef(null);
  const send = useConsultationMessage(consultation.id);
  const closed = ['completed', 'cancelled'].includes(consultation.status);
  const title = consultation.mode === 'chat' ? t('consult.chatTitle') : t('consult.messagesTitle');

  // An expert asking "send me a photo of the underside" needs the farmer to be able to answer
  // in the thread, so a message is text, a photo, or both.
  const attach = (file) => {
    if (!file) return;
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };
  const clearPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text && !photo) return;
    const form = new FormData();
    if (text) form.append('body', text);
    if (photo) form.append('image', photo.file);
    send.mutate(form, {
      onSuccess: () => {
        setBody('');
        clearPhoto();
      },
    });
  };

  const error = send.error?.response?.data?.error?.message;

  return (
    <section className="card scroll-mt-24 p-5 sm:p-6" id={id}>
      <SectionTitle icon={MessageSquare}>{title}</SectionTitle>
      {/* The photo and the model's answer are the first things in the thread, so the farmer
          never has to describe what they already uploaded. */}
      {consultation.caseSummary?.imageUrl && (
        <div className="mb-4 flex gap-3.5 rounded-card bg-brand-50/70 p-3 ring-1 ring-brand-200/60">
          <img
            src={consultation.caseSummary.imageUrl}
            alt={t('consult.caseTitle')}
            className="size-20 shrink-0 rounded-control object-cover ring-1 ring-line"
          />
          <div className="min-w-0 text-sm">
            <p className="font-bold text-brand-900">{consultation.caseSummary.diseaseName || t('common.unknown')}</p>
            {consultation.caseSummary.confidence != null && (
              <p className="text-ink-muted">
                {t('result.confidence')}: {Math.round(consultation.caseSummary.confidence * 100)}%
              </p>
            )}
            {consultation.caseSummary.severityPercent != null && (
              <p className="text-ink-muted">
                {t('progression.severity')}: {consultation.caseSummary.severityPercent}%
              </p>
            )}
            <p className="mt-1 text-xs text-ink-subtle">{t('consult.photoForwarded')}</p>
          </div>
        </div>
      )}

      <ol className="space-y-3 rounded-card bg-surface-sunken p-3 ring-1 ring-line sm:p-4">
        {consultation.messages?.map((m) => {
          const mine = String(m.sender?.id ?? m.sender) === String(meId);
          return (
            <li key={m.id ?? m.sentAt} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={clsx(
                  'max-w-[85%] overflow-hidden rounded-2xl text-sm',
                  mine ? 'rounded-br-md bg-brand-700 text-white shadow-[var(--shadow-brand)]' : 'rounded-bl-md border border-line bg-surface shadow-[var(--shadow-xs)]',
                  m.image?.url ? 'p-1.5' : 'px-4 py-2.5',
                )}
              >
                {m.image?.url && (
                  <a href={m.image.url} target="_blank" rel="noreferrer noopener" className="block">
                    <img
                      src={m.image.url}
                      alt={t('consult.sentPhoto')}
                      loading="lazy"
                      className="max-h-64 w-full rounded-xl object-cover"
                    />
                  </a>
                )}
                <div className={m.image?.url ? 'px-2.5 pb-1 pt-2' : ''}>
                  {m.body && <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>}
                  <p className={`mt-1 text-xs ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                    {t(`consult.role.${m.senderRole}`)} · {shortDate(m.sentAt, i18n.language)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
        {!consultation.messages?.length && (
          <li className="flex items-center justify-center gap-2 py-6 text-sm text-ink-muted">
            <MessageSquare className="size-4" aria-hidden="true" />
            {t('consult.chatEmpty')}
          </li>
        )}
      </ol>

      {!closed && !readOnly && (
        <form className="mt-4" onSubmit={submit}>
          {photo && (
            <div className="mb-2.5 flex items-center gap-3 rounded-card border border-line bg-surface-sunken p-2">
              <img src={photo.preview} alt="" className="size-14 shrink-0 rounded-control border border-line object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{photo.file.name}</p>
              <button type="button" className="btn-ghost rounded-full px-2" onClick={clearPhoto} aria-label={t('common.cancel')}>
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              onChange={(e) => attach(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-secondary size-11 shrink-0 rounded-full px-0 text-brand-700"
              onClick={() => fileRef.current?.click()}
              aria-label={t('consult.attachPhoto')}
              title={t('consult.attachPhoto')}
            >
              <ImagePlus className="size-5" aria-hidden="true" />
            </button>
            <input
              className="input min-w-0 flex-1 rounded-full px-5"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={photo ? t('consult.captionPlaceholder') : t('consult.chatPlaceholder')}
              maxLength={2000}
              aria-label={title}
            />
            <button
              type="submit"
              className="btn-primary size-11 shrink-0 rounded-full px-0"
              disabled={send.isPending || (!body.trim() && !photo)}
            >
              {send.isPending ? <Spinner className="size-4 text-white" /> : <Send className="size-4" aria-hidden="true" />}
              <span className="sr-only">{t('consult.send')}</span>
            </button>
          </div>
          {error && (
            <Alert tone="danger" className="mt-2">
              {error}
            </Alert>
          )}
        </form>
      )}
    </section>
  );
}
